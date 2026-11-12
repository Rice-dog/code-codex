// SPDX-License-Identifier: GPL-3.0-or-later
#include "room_state.h"
#include <cstdlib>
#include <iostream>
using namespace code_codex::remote;
void check(bool value) { if (!value) std::abort(); }
template<class F> void rejects(F action) {
    try { action(); } catch (const std::exception&) { return; }
    std::abort();
}
int main() {
    RoomState room;
    rejects([&] { room.host("123", "b"); });
    rejects([&] { room.host("12x456", "b"); });
    room.host("123456", "b");
    check(room.yieldTo("123456", "a"));
    check(!room.yieldTo("654321", "a"));
    check(!room.yieldTo("123456", "c"));
    check(room.request({"a", "Computer A", Permission::control, true}));
    check(!room.request({"a", "spoofed duplicate", Permission::view, false}));
    check(room.pending().at("a").device == "Computer A");
    check(room.grants().empty()); // A join request cannot control or transfer.
    check(!room.yieldTo("123456", "a"));
    const auto a = room.approve("a", Permission::control, true);
    check(a.files && room.pending().empty());
    rejects([&] { room.approve("a", Permission::control, true); });
    check(room.request({"b", "Computer B", Permission::control, false}));
    rejects([&] { room.approve("b", Permission::control, false); });
    check(room.pending().contains("b"));
    room.approve("b", Permission::view, false); // Viewer can coexist with controller.
    check(room.request({"c", "Computer C", Permission::view, false}));
    rejects([&] { room.approve("c", Permission::control, false); });
    rejects([&] { room.approve("c", Permission::view, true); });
    check(room.reject("c"));
    check(room.revoke("a"));
    check(!room.revoke("a"));
    room.disconnected("b");
    check(room.grants().empty());
    check(room.request({"d", "Computer D", Permission::control, false}));
    room.approve("d", Permission::control, false);
    check(room.close() == std::vector<std::string>{"d"});
    check(room.code().empty() && room.pending().empty() && room.grants().empty());
    rejects([&] { room.request({"e", "Computer E"}); });
    room.host("654321", "c"); // A new room cannot retain old grants.
    check(room.grants().empty());
    std::cout << "Room approval, scope, single-controller, election and cleanup checks passed.\n";
}
