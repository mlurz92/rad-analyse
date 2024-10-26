// webpack.config.js

const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
    // Einstiegsdateien der Anwendung
    entry: {
        main: './src/js/main.js',
        table: './src/js/table.js',
        filter: './src/js/filter.js',
        upload: './src/js/upload.js',
        optimizations: './src/js/optimizations.js'
    },
    // Ausgabekonfiguration
    output: {
        path: path.resolve(__dirname, 'public/dist'),
        filename: 'js/[name].bundle.js',
        publicPath: '/rad-analyse/dist/',
        clean: true
    },
    // Produktionsmodus für optimierte Builds
    mode: 'production',
    // Modulregeln für die Verarbeitung verschiedener Dateitypen
    module: {
        rules: [
            // Verarbeitung von JavaScript-Dateien mit Babel
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: '>0.25%, not dead',
                                useBuiltIns: 'usage',
                                corejs: 3
                            }]
                        ],
                        cacheDirectory: true
                    }
                }
            },
            // Verarbeitung von CSS-Dateien
            {
                test: /\.css$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    'css-loader'
                ]
            },
            // Laden von Bilddateien
            {
                test: /\.(png|jpg|jpeg|gif|svg)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'images/[hash][ext][query]'
                }
            },
            // Laden von Schriftartdateien
            {
                test: /\.(woff(2)?|eot|ttf|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'fonts/[hash][ext][query]'
                }
            }
        ]
    },
    // Plugins zur Erweiterung von Webpack-Funktionen
    plugins: [
        new MiniCssExtractPlugin({
            filename: 'css/[name].bundle.css'
        })
    ],
    // Optimierungseinstellungen für Produktionsbuilds
    optimization: {
        minimizer: [
            // Minimierung von JavaScript
            new TerserPlugin({
                terserOptions: {
                    format: { comments: false },
                    compress: { drop_console: true }
                },
                extractComments: false
            }),
            // Minimierung von CSS
            new CssMinimizerPlugin()
        ],
        splitChunks: {
            cacheGroups: {
                // Erstellung eines separaten Bundles für Vendor-Code
                defaultVendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all'
                }
            }
        },
        // Erstellung eines Runtime-Chunks für bessere Cache-Effizienz
        runtimeChunk: 'single'
    },
    // Auflösung von Modulpfaden und -erweiterungen
    resolve: {
        extensions: ['.js'],
        modules: [path.resolve(__dirname, 'node_modules')]
    },
    // Cache-Konfiguration zur Beschleunigung von Wiederholungsbuilds
    cache: {
        type: 'filesystem',
        buildDependencies: {
            config: [__filename]
        }
    }
};