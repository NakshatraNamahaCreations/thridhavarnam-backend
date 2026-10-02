// PM2 config. The API forks its own worker per CPU core (src/index.js), so
// PM2 runs ONE process in fork mode. Do not use PM2 cluster mode together
// with this; that would multiply the workers.
//   pm2 start deploy/ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'thridhavarnam-api',
      script: 'src/index.js',
      cwd: __dirname + '/..',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production' },
      max_memory_restart: '3G',
      kill_timeout: 12000, // let workers finish in-flight requests
    },
  ],
}
