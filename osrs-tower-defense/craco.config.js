const path = require('path');
const ModuleScopePlugin = require('react-dev-utils/ModuleScopePlugin');

const appSrc = path.resolve(__dirname, '../src');

function widenBabelInclude(rules) {
  for (const rule of rules) {
    if (rule.oneOf) {
      widenBabelInclude(rule.oneOf);
      continue;
    }

    if (rule.loader && rule.loader.includes('babel-loader')) {
      if (Array.isArray(rule.include)) {
        if (!rule.include.includes(appSrc)) {
          rule.include.push(appSrc);
        }
      } else if (rule.include) {
        rule.include = [rule.include, appSrc];
      } else {
        rule.include = appSrc;
      }
    }
  }
}

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      widenBabelInclude(webpackConfig.module.rules);

      // Add support for GLSL files
      webpackConfig.module.rules.push({
        test: /\.(glsl|vs|fs|vert|frag)$/,
        type: 'asset/source',
      });

      // Add alias for rs-map-viewer
      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        '@rs-map-viewer/mapviewer': path.resolve(__dirname, '../src/lib/mapviewer'),
        '@rs-map-viewer/rs': path.resolve(__dirname, '../src/rs'),
        '@rs-map-viewer/towerdefense': path.resolve(__dirname, '../src/towerdefense'),
      };

      webpackConfig.resolve.fallback = {
        ...webpackConfig.resolve.fallback,
        fs: false,
      };

      webpackConfig.resolve.plugins = webpackConfig.resolve.plugins.filter(
        (plugin) => !(plugin instanceof ModuleScopePlugin),
      );

      return webpackConfig;
    },
  },
};
