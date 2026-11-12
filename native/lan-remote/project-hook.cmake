# Aspia uses CMAKE_SOURCE_DIR for its tools and generated resources. Keep it as
# the root project; attach our executable after its existing targets are defined.
cmake_language(EVAL CODE
    "cmake_language(DEFER CALL include [[${CMAKE_CURRENT_LIST_DIR}/CMakeLists.txt]])")
