cmake_minimum_required(VERSION 3.15)
project(transit_addon C)

set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

file(GLOB_RECURSE SOURCES "src/*.c")

add_library(${PROJECT_NAME} SHARED ${SOURCES})

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_INC}
    ${CMAKE_JS_SRC}
)

target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB})

set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)
