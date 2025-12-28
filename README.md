# bb (Bash-based build system)
Generate a automated Makefile from bash variables

## Prerequisites
- **Bash**
- **Make** (for running the generated)

## Installation
You can either install to your operating system or install to your project

### Installing to Project
1. **Add bb to your project**
    ```bash
    git submodule add --depth 1 https://github.com/umtozkn/bb.git
    ```
2. **Installing to operating system**

3. **Create a any build variables file**

    Create a file with starting with;

    if you installed `bb` to your project:
    ```bash
    #! ./bb/bb
    ```

    if you installed `bb` to your operating system:
    ```bash
    #! /usr/bin/bb
    ```

    `./bb/bb` and `/usr/bin/bb` refers to where `bb` located

4. **Running**

    If you haven't setup the rest of build variables, please go to **Configuration** section

    Now run the file that you created and it will output Makefile

    To compile your project, run `make`

## Configuration
You can see variables that `bb` recognizes, look `build.vars` file

### Docs
The `...` refers, a value that contains in `group` variable (keep reading)
- **all_silent**: Defines whatever make command outputs be suppressed, `true` by default, set `false` to show outputs
- **all_final_flags**: Defines flags of final output, not replaced by other variables
- **default_final_executable**: Defines executable of final output, replaced by `..._final_executable` if defined
- **var_default_final_flags**: Defines flags of final output, replaced by `..._final_flags` if defined
- **all_extension_(extension)_flags**: Defines flags of every (extension) files, not replaced by other variables
- **default_extension_(extension)_executable**: Defines executable of every (extension) files, replaced by `..._default_extension_(extension)_executable` if defined
- **default_source_(name)_(extension)_executable**: Defines executable of one file in every groups, replaced by `..._source_(name)_(extension)_executable` if defined
- **default_source_(name)_(extension)_flags**: Defines flags of one file in every groups, not replaced
- **groups**: This variable is main criticial variable for generating makefile, can not contain `all` or `default`, can take multiple values (eg. groups="foo bar"), the `...` refers one of values that `group` contains
- **..._description**: Description of target
- **..._build_dir**: Build path where the files will be emitted, never leave empty
- **..._sources**: Can take many values (eg. "foo bar") but values should be relative path instead of full path