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

__TAB=$'\t'
__NL=$'\n'


var_silent="build_silent"
var_build_dir="build_build_dir"
var_final_name="build_final_name"
var_final_exec="build_final_exe"
var_final_flags="build_final_flags"
var_sources="build_sources"

__recipe_out=""
__objects=""

for source in ${!var_sources}; do
### The Real One
source_name="${source%%.*}"
source_name="${source_name//\//_}"
source_extension="${source##*.}"

var_source_out="build_source_${source_name}_${source_extension}_out"

obj_out="${!var_source_out:-${!var_build_dir}$source.o}"
__objects+="$obj_out "

var_top_ext_exe="build_ext_${source_extension}_exe"
var_top_ext_flags="build_ext_${source_extension}_flags"

var_source_exe="build_source_${source_name}_${source_extension}_exe"
var_source_flags="build_source_${source_name}_${source_extension}_flags"

final_executable="${!var_source_exe:-${!var_top_ext_exe}}"
final_flags="${!var_top_ext_flags} ${!var_source_flags}"

__recipe_out+="${obj_out}: $source"$__NL$__TAB"@mkdir -p \$(dir \$@)"$__NL$__TAB"$( [[ -z "$var_silent" || "$var_silent" == "true" ]] && echo '@';)$final_executable $final_flags"$__NL
### The Real One
done

if [ "$BUILD_MODE" == "release" ]; then 
__out="${!var_build_dir}${!var_final_name}: "$__NL$__TAB"$( [[ -z "$var_silent" || "$var_silent" == "true" ]] && echo '@';)${!var_final_exec} ${!var_final_flags}"
else
__out="OBJ=$__objects$__NL${!var_build_dir}${!var_final_name}: \$(OBJ)"$__NL$__TAB"$( [[ -z "$var_silent" || "$var_silent" == "true" ]] && echo '@';)${!var_final_exec} ${!var_final_flags}"$__NL$__recipe_out"-include \$(OBJ:.o=.d)"
fi

if [[ -n "$__out" ]]; then
echo "$__out" > Makefile
fi