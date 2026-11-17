// SPDX-License-Identifier: GPL-3.0-or-later
// Code-Codex adapter, 2026. Uses Aspia by Dmitry Chapyshev and contributors.
// This helper is distributed under GPL-3.0-or-later; see COPYING.
#include <cstdio>
#include <memory>
#include <QHostAddress>
#include <QJsonDocument>
#include <QJsonObject>

#include "base/gui_application.h"
#include "base/crypto/secure_string.h"
#include "client/config.h"
#include "client/database.h"
#include "client/desktop/desktop/desktop_window.h"
#include "client/desktop/file_transfer/file_transfer_window.h"
#include "proto/desktop_control.h"
#include "proto/peer.h"

// Reuse upstream's process-wide database-path override before any worker starts.
// The upstream header exposes this narrow access through its existing friend.
// A main-thread Database::open(":memory:") alone would leave worker DBs on disk.
class DatabaseTestPeer {
public:
    static void useEphemeralSettings() { Database::setFilePathForTesting(":memory:"); }
};

namespace {
int fail(const char* message)
{
    std::fprintf(stderr, "REMOTE_VIEWER_CONFIG: %s\n", message);
    return 2;
}
}

int remoteViewerMain(int argc, char** argv)
{
    // Credentials arrive through the parent's private pipe, never arguments or a disk file.
    // A single session has a single configuration; there is no address book to unlock.
    char input[4096];
    if (!std::fgets(input, sizeof(input), stdin))
        return fail("No approved session configuration was supplied.");
    QByteArray bytes(input);
    if (!bytes.endsWith('\n'))
        return fail("Session configuration must be one bounded JSON line.");
    QJsonParseError error;
    const QJsonDocument document = QJsonDocument::fromJson(bytes, &error);
    if (error.error != QJsonParseError::NoError || !document.isObject())
        return fail("Session configuration is not a JSON object.");
    const QJsonObject config = document.object();
    for (const QString& key : config.keys())
        if (key != "address" && key != "port" && key != "username" &&
            key != "password" && key != "mode" && key != "loopbackTest" && key != "locale")
            return fail("Session configuration contains an unknown field.");
    const QString address = config.value("address").toString();
    const int port = config.value("port").toInt();
    const QString username = config.value("username").toString();
    const QString password = config.value("password").toString();
    const QString mode = config.value("mode").toString();
    QHostAddress peer;
    if (!peer.setAddress(address) || peer.protocol() != QAbstractSocket::IPv4Protocol ||
        port < 1 || port > 65535 || username.isEmpty() || username.size() > 64 ||
        password.size() < 8 || password.size() > 64 ||
        (mode != "desktop" && mode != "files"))
        return fail("The approved session address, credentials or mode are invalid.");

    Q_INIT_RESOURCE(common);
    Q_INIT_RESOURCE(common_translations);
    GuiApplication application(argc, argv);
    application.setLocale(config.value("locale").toString()=="zh-CN"?"zh_CN":"en");
    // The upstream per-thread path override avoids an existing address book
    // and leaves no credential/settings database behind after a room closes.
    DatabaseTestPeer::useEphemeralSettings();
    HostConfig host;
    host.setAddress(address + ':' + QString::number(port));
    host.setUsername(username);
    host.setPassword(SecureString(password));
    host.setName("Code-Codex LAN");
    std::unique_ptr<ClientWindow> window;
    if (mode == "desktop") {
        auto desktop=defaultDesktopConfig();
        desktop.set_wallpaper(true);desktop.set_effects(true);
        if(config.value("loopbackTest").toBool()) {
            desktop.set_clipboard(false);desktop.set_audio(false);
            desktop.set_disable_preferred_size(true);
        }
        window = std::make_unique<DesktopWindow>(desktop);
    }
    else
        window = std::make_unique<FileTransferWindow>();
    window->resize(1280, 800);
    if(config.value("loopbackTest").toBool()) {
        window->setWindowFlags(window->windowFlags()|Qt::WindowDoesNotAcceptFocus|Qt::WindowTransparentForInput);
        window->setAttribute(Qt::WA_ShowWithoutActivating);window->setEnabled(false);
    }
    QObject::connect(window.get(), &ClientWindow::sig_sessionReady, &application, [] {
        std::fputs("{\"event\":\"session-ready\"}\n",stdout);std::fflush(stdout);
    });
    QObject::connect(window.get(), &ClientWindow::sig_connectRequested, &application,
        [](const HostConfig&, proto::peer::SessionType type) {
            if(type==proto::peer::SESSION_TYPE_FILE_TRANSFER) {
                std::fputs("{\"event\":\"open-files\"}\n",stdout);std::fflush(stdout);
            }
        });
    if (!window->connectToHost(host, "Code-Codex"))
        return fail("The native session could not start.");
    window->show();
    return application.exec();
}
