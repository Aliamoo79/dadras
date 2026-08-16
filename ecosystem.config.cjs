const path = require('node:path')

module.exports = {
  apps: [{
    name: 'dadras',
    script: 'server/index.mjs',
    cwd: __dirname,
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    restart_delay: 3000,
    max_memory_restart: '500M',
    time: true,
    env: {
      NODE_ENV: 'production',
      HOST: process.env.HOST || '127.0.0.1',
      PORT: process.env.PORT || '8787',
    },
    error_file: path.join(__dirname, 'dadras-error.log'),
    out_file: path.join(__dirname, 'dadras-output.log'),
    merge_logs: true,
  }],
}
