if(NOT TARGET aspia_client_core)
    message(FATAL_ERROR "Include this adapter after the pinned Aspia project targets")
endif()
add_executable(code_codex_remote_viewer "${CMAKE_CURRENT_LIST_DIR}/viewer.cc")
target_include_directories(code_codex_remote_viewer PRIVATE
    "${PROJECT_SOURCE_DIR}/source" "${PROJECT_BINARY_DIR}/source")
target_link_libraries(code_codex_remote_viewer PRIVATE aspia_client_core)
set_target_properties(code_codex_remote_viewer PROPERTIES AUTOMOC ON AUTORCC ON
    CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON
    MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
qt_import_plugins(code_codex_remote_viewer INCLUDE "" EXCLUDE ""
    INCLUDE_BY_TYPE imageformats iconengines EXCLUDE_BY_TYPE "")
if(EXISTS "${PROJECT_SOURCE_DIR}/source/code_codex_worker_wiring.inc")
    add_executable(code_codex_remote_host "${CMAKE_CURRENT_LIST_DIR}/host.cc")
    target_include_directories(code_codex_remote_host PRIVATE
        "${PROJECT_SOURCE_DIR}/source" "${PROJECT_BINARY_DIR}/source")
    target_link_libraries(code_codex_remote_host PRIVATE aspia_host_core)
    set_target_properties(code_codex_remote_host PROPERTIES AUTOMOC ON AUTORCC ON
        CXX_STANDARD 20 CXX_STANDARD_REQUIRED ON
        MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
    qt_import_plugins(code_codex_remote_host INCLUDE "" EXCLUDE ""
        INCLUDE_BY_TYPE imageformats iconengines EXCLUDE_BY_TYPE "")
endif()
