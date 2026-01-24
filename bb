#! /usr/bin/env bash

#    Shell-based build system https://github.com/umtozkn/bb
#
#    Copyright (C) 2026 Umut Fahri Ozkan
#
#    This program is free software: you can redistribute it and/or modify
#    it under the terms of the GNU General Public License as published by
#    the Free Software Foundation, either version 3 of the License, or
#    (at your option) any later version.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU General Public License for more details.
#
#    You should have received a copy of the GNU General Public License
#    along with this program.  If not, see <https://www.gnu.org/licenses/>.

#################################################################################################################################

if [[ "$BUILD_MODE" != "release" && "$BUILD_MODE" != "debug" ]]; then
    echo "Warning: BUILD_MODE is invalid, setting as release" >&2
    BUILD_MODE="release"
fi
export BUILD_MODE

case "$OSTYPE" in
    msys) 
        PLATFORM="WinNT" 
        ;;
esac

build_dir=build

build_ext_c_flags+=" -c -MMD -MF \$@.d -o \$@ \$<"

if [ "$BUILD_MODE" == "debug" ]; then
build_ext_c_flags+=" -ggdb -O0"
fi

if [ "$BUILD_MODE" == "release" ]; then
build_ext_c_flags+=" -g0 -O2"
fi

#################################################################################################################################
import_group() {
    local from="$1"
    local to="$2"
    local temp

    temp="build_${from}_final_flags"
    declare -g "build_${to}_final_flags+= ${!temp}"

    for v in $(compgen -v "build_${from}_ext_"); do  
    if [[ "$v" == *_flags ]]; then
        declare -g "${v/build_${from}_ext_/build_${to}_ext_}+=${!v:+ ${!v}}"
    fi
    if [[ "$v" == *_exe ]]; then
        declare -g "${v/build_${from}_ext_/build_${to}_ext_}="
    fi
        declare -g "${v}="
    done


    temp="build_${from}_sources"
    for source in ${!temp}; do
        declare -g "build_${to}_sources+= $source"
        source="${source//[\/.]/_}"
        temp="build_${from}_src_${source}_flags"
        declare -g "build_${to}_src_${source}_flags+= ${!temp}"

        declare -g "build_${from}_src_${source}_exe="
        declare -g "build_${from}_src_${source}_flags="
    done

    declare -g "build_${from}_sources="
    declare -g "build_${from}_final_exe="
    declare -g "build_${from}_final_flags="

    temp="build_groups"
    declare -g "build_groups=${!temp//${from}/}"
}

source $1
#################################################################################################################################

__TAB=$'\t'
__NL=$'\n'

__targets=""
__make_out=""
var_build_dir="build_dir"

for group in $build_groups; do
__targets+="${!var_build_dir}/$group "

var_group_final_exe="build_${group}_final_exe"
var_group_final_exe_suffix="build_${group}_final_exe_suffix"
var_group_final_flags="build_${group}_final_flags"
var_group_sources="build_${group}_sources"

__recipe_out=""
__final_objects=""

for source in ${!var_group_sources}; do
### The Real One
source_var="${source//[\/.]/_}"

obj_out="${!var_build_dir}/$source.o"
__final_objects+=" $obj_out"

var_top_ext_exe="build_ext_${source##*.}_exe"
var_group_ext_exe="build_${group}_ext_${source##*.}_exe"
var_top_source_exe="build_src_${source_var}_exe"
var_group_source_exe="build_${group}_src_${source_var}_exe"
final_executable="${!var_group_source_exe:-${!var_top_source_exe:-${!var_group_ext_exe:-${!var_top_ext_exe}}}}"

var_group_source_flags="build_${group}_src_${source_var}_flags"
var_top_source_flags="build_src_${source_var}_flags"
final_flags="${!var_top_source_flags} ${!var_group_source_flags}"

extensions="${source#*.}"
IFS='.' read -ra parts <<< "$extensions"
for p in "${parts[@]}"; do
if [[ -n $p ]]; then
top_flags="build_ext_${p}_flags"
group_flags="build_${group}_ext_${p}_flags"

final_flags+=" ${!top_flags} ${!group_flags}"
fi
done

__recipe_out+="${obj_out}: $source"$__NL$__TAB"@mkdir -p \$(dir \$@)"$__NL$__TAB"$final_executable $final_flags"$__NL
### The Real One
done

__make_out+="OBJ_$group=$__final_objects$__NL${!var_build_dir}/$group${!var_group_final_exe_suffix}:\$(OBJ_$group)$__NL$__TAB${!var_group_final_exe} ${!var_group_final_flags}"$__NL$__recipe_out"-include \$(OBJ_$group:=.d)"$__NL

done

__out="all: $__targets$__NL$__make_out"

if [[ -n "$__out" ]]; then
echo "$__out" > Makefile
fi