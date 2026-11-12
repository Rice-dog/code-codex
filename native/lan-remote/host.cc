// SPDX-License-Identifier: GPL-3.0-or-later
// Code-Codex adapter, 2026; native media and input are provided by Aspia.
#include <cstdio>
#include <QHostAddress>
#include <QJsonDocument>
#include <QJsonObject>
#include "base/core_application.h"
#include "base/crypto/random.h"
#include "base/crypto/secure_string.h"
#include "base/peer/user_list.h"
#include "base/threading/asio_event_dispatcher.h"
#include "host/host_utils.h"
#include "host/workers/audio_worker.h"
#include "host/workers/input_worker.h"
#include "host/workers/portable_desktop_worker.h"
#include "host/workers/portable_file_worker.h"
#include "host/workers/portable_user_worker.h"
#include "host/workers/screen_worker.h"
#include "proto/peer.h"

class ApprovedUser final : public UserList {
public:
    explicit ApprovedUser(User user) : user_(std::move(user)), seed_(Random::byteArray(32)) {}
    User find(const QString& name) const override { return name == user_.name ? user_ : User(); }
    QByteArray seedKey() const override { return seed_; }
    void setSeedKey(const QByteArray& seed) override { seed_ = seed; }
private:
    User user_;
    QByteArray seed_;
};

// Generated from upstream launchUserMode's worker wiring during source preparation.
// Kept as one shared pipeline: no replacement capture, codec, file or input engine.
#include "code_codex_worker_wiring.inc"

int main(int argc, char** argv)
{
    char input[4096];
    if (!std::fgets(input, sizeof(input), stdin)) return 2;
    const QByteArray bytes(input);
    QJsonParseError error;
    const auto document = QJsonDocument::fromJson(bytes, &error);
    if (!bytes.endsWith('\n') || error.error != QJsonParseError::NoError || !document.isObject())
        return 2;
    const auto config = document.object();
    for (const auto& key : config.keys())
        if (key != "address" && key != "port" && key != "username" && key != "password" && key != "files")
            return 2;
    const auto address = config.value("address").toString();
    const auto username = config.value("username").toString();
    const auto password = SecureString(config.value("password").toString());
    const auto port = config.value("port").toInt();
    QHostAddress iface;
    if (!iface.setAddress(address) || iface.protocol() != QAbstractSocket::IPv4Protocol ||
        port < 1 || port > 65535 || !User::isValidUserName(username) || !User::isValidPassword(password) ||
        !config.value("files").isBool())
        return 2;
    User user = User::create(username, password);
    user.flags = User::ENABLED;
    user.sessions = proto::peer::SESSION_TYPE_DESKTOP;
    if (config.value("files").toBool()) user.sessions |= proto::peer::SESSION_TYPE_FILE_TRANSFER;
    if (!user.isValid()) return 2;
    HostUtils::setDpiAwareness();
    return runRoomHost(argc, argv, SharedPointer<UserList>(new ApprovedUser(std::move(user))),
                       static_cast<quint16>(port), address);
}
