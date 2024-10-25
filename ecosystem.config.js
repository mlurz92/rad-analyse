module.exports = {
  apps: [{
    name: 'rad-analyse',
    script: 'server/server.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 3002,
      HOST: 'localhost',
    },
    max_memory_restart: '500M',
    error_file: 'logs/error.log',
    out_file: 'logs/access.log',
    time: true,
  }]
};
