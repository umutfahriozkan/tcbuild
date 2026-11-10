export default {
  title: 'Linux/arm 3.4.39 Kernel Configuration',
  saveFile: '.config',
  options: [
    {
      type: 'bool',
      name: 'PATCH_PHYS_VIRT',
      title: 'Patch physical to virtual translations at runtime',
      default: false
    },
    {
      type: 'menu',
      title: 'General setup',
      children: []
    },
    {
      type: 'menu',
      name: 'MODULES',
      symbolType: 'bool',
      title: 'Enable loadable module support',
      default: false,
      children: []
    },
    {
      type: 'menu',
      name: 'BLOCK',
      symbolType: 'bool',
      title: 'Enable the block layer',
      default: true,
      children: []
    },
    {
      type: 'menu',
      title: 'System Type',
      children: []
    },
    {
      type: 'bool',
      name: 'FIQ_DEBUGGER',
      title: 'FIQ Mode Serial Debugger',
      default: false
    },
    {
      type: 'menu',
      title: 'Bus support',
      children: []
    },
    {
      type: 'menu',
      title: 'Kernel Features',
      children: []
    },
    {
      type: 'menu',
      title: 'Boot options',
      children: []
    },
    {
      type: 'menu',
      title: 'CPU Power Management',
      children: []
    },
    {
      type: 'menu',
      title: 'Floating point emulation',
      children: []
    },
    {
      type: 'menu',
      title: 'Userspace binary formats',
      children: []
    },
    {
      type: 'menu',
      title: 'Power management options',
      children: []
    },
    {
      type: 'menu',
      name: 'NET',
      symbolType: 'bool',
      title: 'Networking support',
      default: true,
      children: []
    },
    {
      type: 'menu',
      title: 'Device Drivers',
      children: []
    },
    {
      type: 'menu',
      title: 'File systems',
      children: []
    },
    {
      type: 'menu',
      title: 'Kernel hacking',
      children: []
    },
    {
      type: 'menu',
      title: 'Security options',
      children: []
    },
    {
      type: 'menu',
      name: 'CRYPTO',
      symbolType: 'tristate',
      title: 'Cryptographic API',
      default: 'y',
      children: []
    },
    {
      type: 'menu',
      title: 'Library routines',
      children: []
    }
  ]
}