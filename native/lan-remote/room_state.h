// SPDX-License-Identifier: GPL-3.0-or-later
#pragma once
#include <algorithm>
#include <map>
#include <optional>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace code_codex::remote {
enum class Permission { view, control };
struct JoinRequest {
    std::string id;
    std::string device;
    Permission requested = Permission::control;
    bool files = false;
};
struct Grant {
    JoinRequest peer;
    Permission permission;
    bool files;
};

// One owner per instance. Called on the room event loop, never from media workers.
// Credentials stay in the native engine; this object holds only approval metadata.
class RoomState {
public:
    void host(std::string code, std::string instance) {
        if (!code_.empty()) throw std::logic_error("REMOTE_ROOM_ALREADY_OPEN");
        if (code.size() != 6 || !std::all_of(code.begin(), code.end(),
            [](char c) { return c >= '0' && c <= '9'; }) || instance.empty())
            throw std::invalid_argument("REMOTE_ROOM_INVALID");
        code_ = std::move(code);
        instance_ = std::move(instance);
    }

    bool request(JoinRequest request) {
        if (code_.empty()) throw std::logic_error("REMOTE_ROOM_CLOSED");
        if (request.id.empty() || request.id.size() > 64 || request.device.empty() ||
            request.device.size() > 128)
            throw std::invalid_argument("REMOTE_JOIN_INVALID");
        if (grants_.contains(request.id)) return false;
        const std::string id = request.id;
        return pending_.emplace(id, std::move(request)).second;
    }

    Grant approve(const std::string& id, Permission permission, bool files) {
        const auto found = pending_.find(id);
        if (found == pending_.end()) throw std::logic_error("REMOTE_JOIN_NOT_PENDING");
        // The host can reduce a request's scope, never silently expand it.
        if ((permission == Permission::control && found->second.requested != Permission::control) ||
            (files && !found->second.files))
            throw std::logic_error("REMOTE_GRANT_EXCEEDS_REQUEST");
        if (permission == Permission::control && std::any_of(grants_.begin(), grants_.end(),
            [](const auto& item) { return item.second.permission == Permission::control; }))
            throw std::logic_error("REMOTE_CONTROLLER_IN_USE");
        Grant grant{found->second, permission, files};
        grants_.emplace(id, grant);
        pending_.erase(found);
        return grant;
    }

    bool reject(const std::string& id) { return pending_.erase(id) != 0; }
    bool revoke(const std::string& id) { return grants_.erase(id) != 0; }
    void disconnected(const std::string& id) { pending_.erase(id); grants_.erase(id); }

    // A simultaneous-create tie only elects a host; it grants no remote permission.
    bool yieldTo(const std::string& code, const std::string& instance) const {
        return !code_.empty() && code == code_ && !instance.empty() && instance < instance_ &&
            grants_.empty() && pending_.empty();
    }
    std::vector<std::string> close() {
        std::vector<std::string> disconnected;
        for (const auto& [id, grant] : grants_) disconnected.push_back(id);
        grants_.clear(); pending_.clear(); code_.clear(); instance_.clear();
        return disconnected;
    }
    const std::map<std::string, JoinRequest>& pending() const { return pending_; }
    const std::map<std::string, Grant>& grants() const { return grants_; }
    const std::string& code() const { return code_; }
private:
    std::string code_, instance_;
    std::map<std::string, JoinRequest> pending_;
    std::map<std::string, Grant> grants_;
};
}
