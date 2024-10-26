// ecosystem.config.js

module.exports = {
  apps: [{
    name: 'rad-analyse',
    script: 'server/server.js',
    watch: true,
    env_production: {
      NODE_ENV: 'production',
      PORT: 3002,
      HOST: 'localhost'
    },
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=512',
    error_file: 'logs/error.log',
    out_file: 'logs/access.log',
    time: true,
    exp_backoff_restart_delay: 100,
    kill_timeout: 3000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};