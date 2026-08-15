cmake_minimum_required(VERSION 3.15)
project(transit_addon CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(node-addon-api REQUIRED)

file(GLOB_RECURSE SOURCES "src/*.cpp")

add_library(${PROJECT_NAME} SHARED ${SOURCES})

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_JS_INC}
    ${CMAKE_JS_SRC}
    ${node-addon-api_INCLUDE_DIRS}
)

target_link_libraries(${PROJECT_NAME} PRIVATE ${CMAKE_JS_LIB})

set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""
    SUFFIX ".node"
)
