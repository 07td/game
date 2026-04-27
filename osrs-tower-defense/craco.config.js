const path = require('path');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add support for GLSL files
      webpackConfig.module.rules.push({
        test: /\.(glsl|vs|fs|vert|frag)$/,
        type: 'asset/source',
      });

      // Add alias for rs-map-viewer
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        '@rs-map-viewer': path.resolve(__dirname, '../src'),
      };

      return webpackConfig;
    },
  },
};