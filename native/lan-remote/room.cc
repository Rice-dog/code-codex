// SPDX-License-Identifier: GPL-3.0-or-later
// Code-Codex LAN room adapter. Native encrypted channels/media are Aspia's.
#include <cstdio>
#include <thread>
#include <QCoreApplication>
#include <QCryptographicHash>
#include <QDir>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>
#include <QMap>
#include <QNetworkDatagram>
#include <QNetworkInterface>
#include <QPointer>
#include <QProcess>
#include <QTimer>
#include <QUdpSocket>
#include <QUuid>
#include <QVariant>
#include "base/core_application.h"
#include "base/crypto/random.h"
#include "base/crypto/secure_string.h"
#include "base/net/tcp_server.h"
#include "base/net/tcp_channel_native.h"
#include "base/peer/client_authenticator.h"
#include "base/peer/user_list.h"
#include "base/threading/asio_event_dispatcher.h"
#include "proto/peer.h"
#include "proto/key_exchange.h"
#include "room_state.h"

int remoteHostMain(int, char**);
namespace {
constexpr quint16 kDiscoveryPort = 34591;
const QStringList kLanRanges{"10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "127.0.0.0/8"};
const QString kOverlayRange="100.64.0.0/10";
const auto kOverlaySubnet=QHostAddress::parseSubnet(kOverlayRange);
QString randomId() { return QUuid::createUuid().toString(QUuid::WithoutBraces); }
QByteArray encode(const QJsonObject& object) { return QJsonDocument(object).toJson(QJsonDocument::Compact); }
void output(QJsonObject object) { const auto bytes=encode(object); std::fwrite(bytes.constData(),1,size_t(bytes.size()),stdout); std::fputc('\n',stdout); std::fflush(stdout); }
bool lan(const QHostAddress& address) {
    for (const auto& range:kLanRanges) if(address.isInSubnet(QHostAddress::parseSubnet(range))) return true;
    return false;
}
bool overlay(const QHostAddress& address) { return address.isInSubnet(kOverlaySubnet); }
class RoomUsers final: public UserList {
public:
    explicit RoomUsers(const QString& password):seed_(Random::byteArray(32)) {
        user_=User::create("room",SecureString(password)); user_.flags=User::ENABLED;
        user_.sessions=proto::peer::SESSION_TYPE_FILE_TRANSFER;
    }
    User find(const QString& name) const override { return name==user_.name?user_:User(); }
    QByteArray seedKey() const override { return seed_; }
    void setSeedKey(const QByteArray& value) override { seed_=value; }
private: User user_; QByteArray seed_;
};

class Room final: public QObject {
public:
    explicit Room(bool localTest=false):localTest_(localTest) {
        connect(&query_,&QUdpSocket::readyRead,this,[this]{readDiscovery(query_);});
        connect(&discovery_,&QUdpSocket::readyRead,this,[this]{readDiscovery(discovery_);});
        discoveryWait_.setSingleShot(true);
        connect(&discoveryWait_,&QTimer::timeout,this,[this]{
            if(phase_!="discovering")return;
            if(target_.isNull())becomeHost();
            else fail("REMOTE_HOST_NOT_FOUND: No matching room answered at that address.");
        });
    }
    ~Room() override { closeRoom(); }
    QJsonObject state() const {
        QJsonArray pending;
        for(const auto& [id,request]:room_.pending()) pending.append(QJsonObject{{"id",QString::fromStdString(id)},{"device",QString::fromStdString(request.device)}});
        const auto phase=role_=="host"&&!room_.grants().empty()?(mediaConnected_?QString("controlled"):QString("starting")):phase_;
        return {{"role",role_},{"phase",phase},{"room",code_},{"pending",pending},
                {"connected",mediaConnected_||phase_=="connected"}, {"fileWindows",filesReady_}, {"error",error_}};
    }
    void command(QJsonObject command) {
        const auto id=command.value("id"); const auto action=command.value("action").toString();
        try {
            if(action=="open") {
                const auto code=command.value("code").toString();
                if(code.size()!=6 || std::any_of(code.begin(),code.end(),[](QChar c){return c<'0'||c>'9';}))
                    throw std::runtime_error("REMOTE_ROOM_INVALID: Enter six digits.");
                QHostAddress target;
                if(command.contains("address")&&(!target.setAddress(command.value("address").toString())||
                    target.protocol()!=QAbstractSocket::IPv4Protocol||
                    (localTest_?!target.isLoopback():target.isLoopback()||(!lan(target)&&!overlay(target)))))
                    throw std::runtime_error("REMOTE_ADDRESS_INVALID: Enter a private or Tailscale IPv4 address.");
                closeRoom(); code_=code;locale_=command.value("locale").toString("en");instance_=randomId();nonce_=randomId();
                target_=target;
                digest_=QString::fromLatin1(QCryptographicHash::hash(("Code-Codex-LAN-v1:"+code_).toUtf8(),QCryptographicHash::Sha256).toHex());
                room_.host(code_.toStdString(),instance_.toStdString()); role_="searching";phase_="discovering";
                if(!query_.bind(QHostAddress(localTest_?QHostAddress::LocalHost:QHostAddress::AnyIPv4),0)) throw std::runtime_error("REMOTE_DISCOVERY_BIND: Discovery socket failed.");
                QJsonObject query{{"protocol","code-codex-lan-v1"},{"kind","find"},{"room",digest_},{"instance",instance_},{"nonce",nonce_}};
                if(target_.isNull())broadcast(query,query_);
                else if(query_.writeDatagram(encode(query),target_,kDiscoveryPort)<0)
                    fail("REMOTE_ADDRESS_SEND: Could not send the room query to that address.");
                if(phase_=="discovering")discoveryWait_.start(target_.isNull()?350:3000);
            } else if(action=="approve") approve(command.value("peer").toString());
            else if(action=="reject") {
                const auto peer=command.value("peer").toString();auto channel=peers_.value(peer);
                if(!room_.reject(peer.toStdString())||!channel) throw std::runtime_error("REMOTE_JOIN_NOT_PENDING: The join request is no longer pending.");
                send(channel,{{"type","rejected"}}); peers_.remove(peer);channel->deleteLater();
            } else if(action=="disconnect") { revoke(); }
            else if(action=="files" && role_=="guest" && phase_=="connected") launchViewer("files");
            else if(action=="stop") closeRoom();
            else if(action!="status") throw std::runtime_error("REMOTE_ACTION_INVALID: Unsupported room action.");
            output({{"id",id},{"result",state()}});publish();
        } catch(const std::exception& error) {output({{"id",id},{"error",QString::fromUtf8(error.what())}});}
    }
private:
    void publish() {output({{"event","state"},{"state",state()}});}
    void fail(const QString& error) {closeRoom();phase_="error";error_=error;publish();}
    void send(TcpChannel* channel,const QJsonObject& object) {if(channel)channel->send(0,encode(object));}
    void broadcast(QJsonObject object, QUdpSocket& socket) {
        object["protocol"]="code-codex-lan-v1"; const auto bytes=encode(object);
        if(localTest_){socket.writeDatagram(bytes,QHostAddress::LocalHost,kDiscoveryPort);return;}
        socket.writeDatagram(bytes,QHostAddress::Broadcast,kDiscoveryPort);
        for(const auto& interface:QNetworkInterface::allInterfaces()) {
            if(!(interface.flags()&QNetworkInterface::IsUp)||interface.flags()&QNetworkInterface::IsLoopBack) continue;
            for(const auto& entry:interface.addressEntries()) if(lan(entry.ip())&&!entry.broadcast().isNull())
                socket.writeDatagram(bytes,entry.broadcast(),kDiscoveryPort);
        }
    }
    void readDiscovery(QUdpSocket& socket) {
        while(socket.hasPendingDatagrams()) {
            const auto datagram=socket.receiveDatagram(1025);
            const auto sender=datagram.senderAddress();
            const bool local=lan(sender);
            if(datagram.data().size()>1024||(!local&&!overlay(sender))||(localTest_&&!sender.isLoopback()))continue;
            const auto message=QJsonDocument::fromJson(datagram.data()).object();
            if(message["protocol"]!="code-codex-lan-v1"||message["room"]!=digest_||message["instance"]==instance_)continue;
            const auto kind=message["kind"].toString();
            if(kind=="find"&&role_=="host"&&server_) {
                QJsonObject reply{{"protocol","code-codex-lan-v1"},{"kind","found"},{"room",digest_},{"instance",instance_},{"nonce",message["nonce"]},{"port",server_->localPort()}};
                discovery_.writeDatagram(encode(reply),datagram.senderAddress(),datagram.senderPort());
            } else if(kind=="found"&&phase_=="discovering"&&message["nonce"]==nonce_&&
                      (target_.isNull()?local:sender==target_))
                join(sender,message["port"].toInt());
            else if(kind=="announce"&&role_=="host"&&local) {
                if(room_.yieldTo(code_.toStdString(),message["instance"].toString().toStdString()))
                    join(datagram.senderAddress(),message["port"].toInt());
                else if(message["instance"].toString()>instance_)
                    broadcast({{"kind","announce"},{"room",digest_},{"instance",instance_},{"port",server_->localPort()}},discovery_);
            }
        }
    }
    void becomeHost() {
        server_=new TcpServer(this);server_->setUserList(SharedPointer<UserList>(new RoomUsers("room-"+code_)));server_->setWhiteList(kLanRanges+QStringList{kOverlayRange});
        connect(server_,&TcpServer::sig_newConnection,this,[this]{
            while(server_&&server_->hasReadyConnections()) {
                auto* channel=server_->nextReadyConnection(); const auto peer=randomId(); peers_[peer]=channel;
                channel->setParent(this);
                connect(channel,&TcpChannel::sig_messageReceived,this,[this,peer,channel](quint8 stream,const QByteArray& bytes){
                    if(stream!=0||bytes.size()>1024)return;
                    const auto message=QJsonDocument::fromJson(bytes).object();
                    if(message["type"]!="join")return;
                    const auto device=QString::fromStdString(channel->peerComputerName()).left(128);
                    try { if(room_.request({peer.toStdString(),device.isEmpty()?"LAN device":device.toStdString(),code_codex::remote::Permission::control,true}))publish(); }
                    catch(const std::exception&) {channel->deleteLater();}
                });
                connect(channel,&TcpChannel::sig_errorOccurred,this,[this,peer,channel](TcpChannel::ErrorCode){
                    const bool active=room_.grants().contains(peer.toStdString());room_.disconnected(peer.toStdString());peers_.remove(peer);
                    if(active)stopMedia();channel->deleteLater();publish();
                });
                channel->setPaused(false);
            }
        });
        if(!server_->start(0,localTest_?"127.0.0.1":"0.0.0.0")||!discovery_.bind(QHostAddress(localTest_?QHostAddress::LocalHost:QHostAddress::AnyIPv4),kDiscoveryPort,QUdpSocket::ShareAddress|QUdpSocket::ReuseAddressHint)) {
            fail("REMOTE_ROOM_LISTEN: Could not listen for LAN devices.");return;
        }
        role_="host";phase_="hosting";query_.close();publish();
        broadcast({{"kind","announce"},{"room",digest_},{"instance",instance_},{"port",server_->localPort()}},discovery_);
    }
    void join(const QHostAddress& address,int port) {
        if(port<1||port>65535)return;
        discoveryWait_.stop();discovery_.close();query_.close();if(server_){delete server_;server_=nullptr;}
        role_="guest";phase_="connecting";peerAddress_=address.toString();
        auto* auth=new ClientAuthenticator();auth->setIdentify(proto::key_exchange::IDENTIFY_SRP);auth->setUserName("room");
        auth->setPassword(SecureString("room-"+code_));auth->setSessionType(proto::peer::SESSION_TYPE_FILE_TRANSFER);auth->setDisplayName("Code-Codex LAN");
        guest_=new TcpChannelNative(TcpChannel::Type::DIRECT,auth,this);
        connect(guest_,&TcpChannel::sig_authenticated,this,[this]{phase_="pending";guest_->setPaused(false);send(guest_,{{"type","join"}});publish();});
        connect(guest_,&TcpChannel::sig_messageReceived,this,[this](quint8 stream,const QByteArray& bytes){
            if(stream!=0||bytes.size()>2048)return; const auto message=QJsonDocument::fromJson(bytes).object();
            if(message["type"]=="approved"&&phase_=="pending") {
                session_=message;session_["address"]=peerAddress_;phase_="starting";launchViewer("desktop");publish();
            } else if(message["type"]=="rejected") fail("REMOTE_JOIN_REJECTED: The host declined your request.");
            else if(message["type"]=="revoked") fail("REMOTE_ACCESS_REVOKED: The host ended the connection.");
        });
        connect(guest_,&TcpChannel::sig_errorOccurred,this,[this](TcpChannel::ErrorCode code){fail("REMOTE_CONNECTION: "+TcpChannel::errorToString(code));});
        guest_->connectTo(peerAddress_,quint16(port),Seconds(30));publish();
    }
    QProcess* startChild(const QString& mode,const QJsonObject& config) {
        auto* child=new QProcess(this);
        const QFileInfo self(QCoreApplication::applicationFilePath());
        if(mode=="viewer") {
            const auto name=self.fileName()=="code_codex_lan_remote.exe"?QString("code_codex_remote_viewer.exe"):
                self.fileName().chopped(8)+"-viewer-x64.exe";
            child->setProgram(self.dir().filePath(name));
        } else {child->setProgram(self.absoluteFilePath());child->setArguments({mode});}
        child->setProcessChannelMode(QProcess::SeparateChannels);
        connect(child,&QProcess::started,this,[child,config]{child->write(encode(config)+'\n');child->closeWriteChannel();});
        connect(child,&QProcess::errorOccurred,this,[this](QProcess::ProcessError){fail("REMOTE_ENGINE_START: The native remote engine could not start.");});
        child->start(); return child;
    }
    void approve(const QString& peer) {
        auto channel=peers_.value(peer);if(!channel)throw std::runtime_error("REMOTE_JOIN_NOT_PENDING: The peer disconnected.");
        room_.approve(peer.toStdString(),code_codex::remote::Permission::control,true);
        const auto password=QString::fromLatin1(Random::byteArray(24).toHex());
        QJsonObject config{{"address",localTest_?"127.0.0.1":"0.0.0.0"},{"port",0},{"username","controller"},{"password",password},{"files",true}};
        media_=startChild("host",config);media_->setProperty("roomPeer",peer);
        connect(media_,&QProcess::readyReadStandardOutput,this,[this,channel,password]{
            mediaOutput_+=media_->readAllStandardOutput();
            while(mediaOutput_.contains('\n')) {
                const auto end=mediaOutput_.indexOf('\n');const auto line=mediaOutput_.left(end);mediaOutput_.remove(0,end+1);
                const auto event=QJsonDocument::fromJson(line).object();const auto port=event["port"].toInt();
                if(event["event"]=="listening"&&port>0&&channel) {send(channel,{{"type","approved"},{"port",port},{"username","controller"},{"password",password}});publish();}
                else if(event["event"]=="session-connected") {mediaConnected_=true;publish();}
            }
        });
        connect(media_,qOverload<int,QProcess::ExitStatus>(&QProcess::finished),this,[this](int,QProcess::ExitStatus){
            if(media_) {revoke();error_="REMOTE_ENGINE_EXITED: The native host stopped.";publish();}
        });
    }
    void launchViewer(const QString& mode) {
        auto config=session_;config.remove("type");config["mode"]=mode;
        config["locale"]=locale_;
        if(localTest_)config["loopbackTest"]=true;
        auto* child=startChild("viewer",config);viewers_.append(child);
        connect(child,&QProcess::readyReadStandardOutput,this,[this,child,mode]{
            auto buffer=child->property("output").toByteArray()+child->readAllStandardOutput();
            while(buffer.contains('\n')) {const auto end=buffer.indexOf('\n');const auto message=QJsonDocument::fromJson(buffer.left(end)).object();buffer.remove(0,end+1);
                if(mode=="desktop"&&message["event"]=="session-ready") {phase_="connected";publish();}
                else if(mode=="files"&&message["event"]=="session-ready") {filesReady_++;publish();}
                else if(message["event"]=="open-files")launchViewer("files");
            }child->setProperty("output",buffer);
        });
        connect(child,qOverload<int,QProcess::ExitStatus>(&QProcess::finished),this,[this,child](int,QProcess::ExitStatus){
            viewers_.removeAll(child);child->deleteLater();
            // Closing the last native window also releases the approved connection.
            if(viewers_.isEmpty()&&role_=="guest") {closeRoom();publish();}
        });
    }
    void stopProcess(QProcess* child) {if(child){child->disconnect(this);child->kill();child->deleteLater();}}
    void stopMedia() {auto* child=media_;media_=nullptr;mediaConnected_=false;mediaOutput_.clear();stopProcess(child);}
    void revoke() {
        const auto grants=room_.grants();
        for(const auto& [id,grant]:grants){auto channel=peers_.take(QString::fromStdString(id));send(channel,{{"type","revoked"}});room_.revoke(id);if(channel)channel->deleteLater();}
        stopMedia();if(role_=="guest")closeRoom();
    }
    void closeRoom() {
        discoveryWait_.stop();discovery_.close();query_.close();stopMedia();
        for(auto child:viewers_)stopProcess(child);viewers_.clear();
        if(guest_){guest_->disconnect(this);guest_->deleteLater();guest_=nullptr;}
        for(auto channel:peers_)if(channel){channel->disconnect(this);delete channel;}peers_.clear();
        if(server_){delete server_;server_=nullptr;}room_.close();filesReady_=0;session_={};code_.clear();digest_.clear();target_.clear();error_.clear();role_="idle";phase_="idle";
    }
    code_codex::remote::RoomState room_;
    const bool localTest_;
    QHostAddress target_;
    QString code_,digest_,instance_,nonce_,peerAddress_,error_,locale_="en",role_="idle",phase_="idle";
    QUdpSocket discovery_,query_;QTimer discoveryWait_;TcpServer* server_=nullptr;TcpChannelNative* guest_=nullptr;
    QMap<QString,QPointer<TcpChannel>> peers_;QProcess* media_=nullptr;bool mediaConnected_=false;QByteArray mediaOutput_;
    QList<QProcess*> viewers_;int filesReady_=0;QJsonObject session_;
};
}
int main(int argc,char** argv) {
    if(argc==2&&QByteArray(argv[1])=="host")return remoteHostMain(argc,argv);
    const bool localTest=argc==2&&QByteArray(argv[1])=="--loopback-test";
    CoreApplication::setEventDispatcher(new AsioEventDispatcher());CoreApplication app(argc,argv);Room room(localTest);
    // Blocking pipe read lives outside the event loop; EOF releases the room.
    std::thread([&room]{char line[4096];while(std::fgets(line,sizeof(line),stdin)) {
        QByteArray bytes(line);if(!bytes.endsWith('\n'))break;
        const auto command=QJsonDocument::fromJson(bytes).object();
        QMetaObject::invokeMethod(&room,[&room,command]{room.command(command);},Qt::QueuedConnection);
    } QMetaObject::invokeMethod(QCoreApplication::instance(),&QCoreApplication::quit,Qt::QueuedConnection);}).detach();
    output({{"event","ready"},{"protocol",1}});return app.exec();
}
