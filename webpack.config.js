const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './multi-token-edit/multi-token-edit.mjs',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'multi-token-edit'),
    publicPath: 'modules/multi-token-edit/',
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
  watch: true,
  devtool: 'source-map',
};
