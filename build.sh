#! /usr/bin/env sh

#    Shell-based build system https://github.com/umtozkn/bs
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

source build.vars

throw_if_empty() {
	if [[ -z "${!1}" ]]; then
    	echo "Error: Variable \"$1\" can not be empty" >&2
    	exit 1
	fi
}

replace_if_empty() {
	if [[ -z "${!1}" ]]; then
		declare -g "$1=$2"
	fi
}

__TAB=$'\t'
__NL=$'\n'

__out="# MyMake Generator v1.0.0
.PHONY: help
help:
	\$(info MyMake v1.0.0)
	\$(info Registered groups:)
"

throw_if_empty "groups"

if [[ "$groups" == *"help"* ]]; then
    echo "Error: Variable 'groups' cannot contain 'help'" >&2
    exit 1
fi

for group in $groups; do

var_description="${group}_description"
replace_if_empty "$var_description" "No Description"
__out+=$__TAB"\$(info - $group: ${!var_description})"$__NL
done
__out+=$__TAB"@echo \"\" > /dev/null"$__NL
for group in $groups; do

var_build_dir="${group}_build_dir"
var_sources="${group}_sources"

throw_if_empty "$var_sources"

replace_if_empty "$var_build_dir" "build/"

__out+=".PHONY: $group"$__NL
__out+="$group: ${!var_build_dir}$group"$__NL
base_out="${!var_build_dir}$group: "
recipes_out=""

for source in ${!var_sources}; do
obj_out="${!var_build_dir}$source.o"
base_out+="$obj_out "
recipes_out+="${obj_out}: $source"$__NL
recipes_out+=$__TAB"@mkdir -p \$(dir \$@)"$__NL

### The Real One
source_name="${source%%.*}"
source_name="${source_name//\//_}"
source_extension="${source##*.}"

default_silent="${group}_default_${source_extension}_silent"
default_executable="${group}_default_${source_extension}_executable"
default_flags="${group}_default_${source_extension}_flags"

source_silent="${group}_source_${source_name}_${source_extension}_silent"
source_executable="${group}_source_${source_name}_${source_extension}_executable"
source_flags="${group}_source_${source_name}_${source_extension}_flags"

final_silent="$( [[ "${!source_silent}" == "true" ]] || { [[ -z "${!source_silent}" && "${!default_silent}" == "true" ]] && echo '@'; } )"
final_executable="${!source_executable:-${!default_executable}}"
final_flags="${!source_flags:-${!default_flags}}"


recipes_out+=$__TAB"$final_silent$final_executable $final_flags"$__NL
### The Real One
done

base_out+=$__NL
final_silent="${group}_final_silent"
final_executable="${group}_final_executable"
final_flags="${group}_final_flags"

base_out+=$__TAB"$( [[ "${!final_silent}" == "true" ]] && echo '@';)${!final_executable} ${!final_flags}"
__out+=$base_out$__NL$recipes_out$__NL

done


echo "$__out" > Makefile