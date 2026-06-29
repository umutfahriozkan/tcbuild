declare global {
  var is_debug: boolean
  var is_win: boolean
  var is_linux: boolean
  var build_dir: string
}

global.is_debug = process.argv[2] !== 'release'
global.is_win = process.platform === 'win32'
global.is_linux = process.platform === 'linux'

//global.build_dir = `build/${is_debug ? "debug" : "release"}/${platform}`;
global.build_dir = `build/${is_debug ? "debug" : "release"}`