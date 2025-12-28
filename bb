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

if [[ -z "$1" ]]; then
    echo "Missing build configuration parameter"
fi

source "$1"

__TAB=$'\t'
__NL=$'\n'

__out=""
__help_out=""
__phony_out=""

if [[ "$groups" == *"default"* || "$groups" == *"all"* ]]; then
    echo "Error: Variable 'groups' cannot contain 'default' or 'all'" >&2
    exit 1
fi

var_all_silent="all_silent"
var_all_final_executable="all_final_executable"
var_all_final_flags="all_final_flags"
var_default_final_executable="default_final_executable"
var_default_final_flags="default_final_flags"
for group in $groups; do
var_description="${group}_description"
var_build_dir="${group}_build_dir"
var_sources="${group}_sources"
var_final_executable="${group}_final_executable"
var_final_flags="${group}_final_flags"

__phony_out+=" $group"
__help_out+=$__TAB"\$(info - $group: ${!var_description})"$__NL
__out+="$group: ${!var_build_dir}$group"$__NL$__TAB"$( [[ -z "$var" || "$var" == "true" ]] && echo '@';)${!var_final_executable:-${!var_default_final_executable}} ${!var_all_final_flags} ${!var_final_flags:-${!var_default_final_flags}}"$__NL

__out+="${!var_build_dir}$group: "
__recipe_out="$__NL"

for source in ${!var_sources}; do
obj_out="${!var_build_dir}$source.o"
__out+="$obj_out "

### The Real One
source_name="${source%%.*}"
source_name="${source_name//\//_}"
source_extension="${source##*.}"

var_top_all_extension_flags="all_extension_${source_extension}_flags"

var_top_default_extension_executable="default_extension_${source_extension}_executable"

var_top_default_source_executable="default_source_${source_name}_${source_extension}_executable"
var_top_default_source_flags="default_source_${source_name}_${source_extension}_flags"

var_all_extension_flags="${group}_all_extension_${source_extension}_flags"

var_default_extension_executable="${group}_default_extension_${source_extension}_executable"

var_source_executable="${group}_source_${source_name}_${source_extension}_executable"
var_source_flags="${group}_source_${source_name}_${source_extension}_flags"

final_executable="${!var_source_executable:-${!var_top_default_source_executable:-${!var_default_extension_executable:-${!var_top_default_extension_executable}}}}"
final_flags="${!var_top_all_extension_flags} ${!var_all_extension_flags} ${!var_top_default_source_flags} ${!var_source_flags}"


__recipe_out+="${obj_out}: $source"$__NL$__TAB"@mkdir -p \$(dir \$@)"$__NL$__TAB"$( [[ -z "$var" || "$var" == "true" ]] && echo '@';)$final_executable $final_flags"$__NL
### The Real One
done

__out+=$__recipe_out

done

if [[ -n "$__phony_out" && -n "$__help_out" && -n "$__out" ]]; then
echo ".PHONY: __SECRET_INTERNAL$__phony_out
__SECRET_INTERNAL:
	\$(info Registered groups:)
$__help_out$__TAB@echo \"\" > /dev/null
$__out" > Makefile
fi