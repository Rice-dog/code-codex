#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Apply the minimal direct-LAN worker adapter to a disposable Aspia source copy.

Never point this at an installed application. The original tagged source and
patch output must accompany any distributed native binaries.
"""
import argparse
import hashlib
from pathlib import Path

EXPECTED = {
    'source/host/workers/portable_user_worker.h':
        '69dd31a4ad24a5980eeb361eec48ea1e369ad7f7aee03f9b3f4765b7e2776009',
    'source/host/workers/portable_user_worker.cc':
        '0ced8c21877d0df0060875c62ae31a0b734f3e729c84a8d31f550128400875dc',
    'source/host/win/portable_host.cc':
        'bccfa25c9eeb3923d48fd5f9b40cfaa2b9926c31aa45ee7bd50496b8da6477e1',
}

def replace_once(text, old, new):
    if text.count(old) != 1:
        raise RuntimeError('REMOTE_BUILD_SOURCE: Required upstream adaptation point is ambiguous.')
    return text.replace(old, new, 1)

def prepare(root):
    originals = {}
    for relative, expected in EXPECTED.items():
        data = (root / relative).read_bytes().replace(b'\r\n', b'\n')
        if hashlib.sha256(data).hexdigest() != expected:
            raise RuntimeError('REMOTE_BUILD_SOURCE: The source copy is not the reviewed unmodified tree: ' + relative)
        originals[relative] = data.decode('utf-8')

    header_path, source_path, portable_path = EXPECTED.keys()
    header = originals[header_path]
    header = replace_once(header, '#include <QList>',
        '#include <QList>\n#include "base/shared_pointer.h"\n#include "base/peer/user_list.h"')
    header = replace_once(header, 'class TcpChannel;', 'class TcpChannel;\nclass TcpServer;')
    header = replace_once(header, '    ~PortableUserWorker() final;', '''    ~PortableUserWorker() final;

    // Code-Codex: configured before WorkerManager starts; no router or GUI service.
    void setDirectRoom(SharedPointer<UserList> users, quint16 port, QString iface)
    {
        direct_users_ = users;
        direct_port_ = port;
        direct_iface_ = std::move(iface);
    }''')
    header = replace_once(header, '    QList<Client*> clients_;', '''    QList<Client*> clients_;
    SharedPointer<UserList> direct_users_;
    ScopedQPointer<TcpServer> direct_server_;
    quint16 direct_port_ = 0;
    QString direct_iface_;''')
    source = originals[source_path]
    source = replace_once(source, '#include "base/net/tcp_channel.h"',
        '#include "base/net/tcp_channel.h"\n#include "base/net/tcp_server.h"\n#include <cstdio>')
    source = replace_once(source, 'void PortableUserWorker::onPrepare()\n{', '''void PortableUserWorker::onPrepare()
{
    if (direct_port_)
    {
        // The room owns approval. Keep the existing message projection object,
        // but do not start its GUI attachment timer or the cloud RouterManager.
        user_session_ = new PortableUserSession(
            PortableHost::uiIpcChannelId(), 0, this);
        direct_server_ = new TcpServer(this);
        direct_server_->setUserList(direct_users_);
        connect(direct_server_, &TcpServer::sig_newConnection, this, [this]()
        {
            while (direct_server_->hasReadyConnections())
                startClient(direct_server_->nextReadyConnection(), QString(), 0);
        });
        return;
    }''')
    source = replace_once(source, 'void PortableUserWorker::onStart()\n{', '''void PortableUserWorker::onStart()
{
    if (direct_port_)
    {
        if (!direct_server_->start(direct_port_, direct_iface_))
        {
            std::fputs("REMOTE_HOST_LISTEN: The room listener could not start.\\n", stderr);
            QMetaObject::invokeMethod(QCoreApplication::instance(), &QCoreApplication::quit, Qt::QueuedConnection);
            return;
        }
        std::fputs("{\\"event\\":\\"listening\\"}\\n", stdout);
        std::fflush(stdout);
        return;
    }''')
    source = replace_once(source, '    router_manager_.reset();\n    user_session_.reset();',
        '    direct_server_.reset();\n    router_manager_.reset();\n    user_session_.reset();')
    # Validate all inputs and adaptations before writing either file.
    portable = originals[portable_path]
    start = portable.index('    CoreApplication::setEventDispatcher', portable.index('int launchUserMode('))
    end = portable.index('    QObject::connect(&application, &QCoreApplication::aboutToQuit', start)
    # Preserve upstream copyright/license in this derived generated source.
    wiring = portable[:portable.index('#include')] + '\nint runRoomHost(int& argc, char** argv, '
    wiring += 'SharedPointer<UserList> users, quint16 port, const QString& iface)\n{\n'
    body = portable[start:end].replace('    CoreApplication::setApplicationVersion(ASPIA_VERSION_STRING);', '')
    body = replace_once(body,
        '    PortableUserWorker* user_worker = CoreApplication::findWorker<PortableUserWorker>();',
        '    PortableUserWorker* user_worker = CoreApplication::findWorker<PortableUserWorker>();\n'
        '    user_worker->setDirectRoom(users, port, iface);')
    wiring += body + '    return application.exec();\n}\n'
    (root / header_path).write_text(header, encoding='utf-8', newline='\n')
    (root / source_path).write_text(source, encoding='utf-8', newline='\n')
    (root / 'source/code_codex_worker_wiring.inc').write_text(wiring, encoding='utf-8', newline='\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    prepare(parser.parse_args().source.resolve())
