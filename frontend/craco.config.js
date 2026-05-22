const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  devServer: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  webpack: {
    configure: (webpackConfig, { env }) => {
      // Find and modify the source-map-loader rule to exclude DOMPurify
      const sourceMapLoaderRule = webpackConfig.module.rules.find(
        rule => rule.use && rule.use.includes && rule.use.includes('source-map-loader')
      );

      if (sourceMapLoaderRule) {
        sourceMapLoaderRule.exclude = [
          ...(sourceMapLoaderRule.exclude || []),
          /node_modules\/dompurify/,
        ];
      }

      // Suppress warnings about missing source maps using the correct format
      if (!webpackConfig.stats) {
        webpackConfig.stats = {};
      }

      webpackConfig.stats.warningsFilter = [
        /Failed to parse source map/,
        /dompurify/,
        /source-map-loader/
      ];

      // Strip console.log / warn / debug in production builds
      if (env === 'production') {
        const terserIndex = webpackConfig.optimization.minimizer.findIndex(
          (m) => m.constructor.name === 'TerserPlugin'
        );
        if (terserIndex !== -1) {
          webpackConfig.optimization.minimizer[terserIndex] = new TerserPlugin({
            terserOptions: {
              compress: {
                drop_console: true,
                drop_debugger: true,
                pure_funcs: ['console.log', 'console.warn', 'console.debug'],
              },
              mangle: true,
            },
            parallel: true,
          });
        }
      }

      return webpackConfig;
    },
  },
};
