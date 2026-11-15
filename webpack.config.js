const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = (env) => {
    return {
        entry: './multi-token-edit/multi-token-edit.mjs',
        output: {
            filename: 'mass-edit.js',
            path: path.resolve(__dirname, 'multi-token-edit/bundle'),
            publicPath: 'modules/multi-token-edit/bundle/',
        },
        optimization: {
            minimizer: [
                new TerserPlugin({
                    terserOptions: {
                        keep_classnames: true,
                        keep_fnames: false,
                    },
                }),
            ],
        },
        externals: {
            jquery: 'jQuery',
        },
        mode: 'production',
        watch: env?.mode === 'watch' ? true : false,
        watchOptions: {
            ignored: ['**/node_modules/', '**/scripts/libs/'],
        },
        devtool: 'source-map',
        plugins: env?.mode === 'analyze' ? [new BundleAnalyzerPlugin()] : [],
    };
};
