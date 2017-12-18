const { resolve, join } = require("path");

const webpack = require("webpack");
const nsWebpack = require("nativescript-dev-webpack");
const nativescriptTarget = require("nativescript-dev-webpack/nativescript-target");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const ExtractTextPlugin = require("extract-text-webpack-plugin");
var MergeFilesPlugin = require('merge-files-webpack-plugin');

const extractMainSheet = new ExtractTextPlugin('app-0.css');
const extractCSS = new ExtractTextPlugin('app-1.css');


module.exports = env => {
  const { build, platform } = getPlatform(env);

  const mainSheet = `app.${build}.css`;

  const entry = {
    // Discover entry module from package.json
    bundle: `./${nsWebpack.getEntryModule()}`,

    // Vendor entry with third-party libraries
    vendor: `./vendor`,

    // Entry for stylesheet with global application styles
    [mainSheet]: `./${mainSheet}`,
  };

  const rules = getRules(build, platform, mainSheet);
  const plugins = getPlugins(env);
  const extensions = getExtensions(build, platform);
  const output = getOutput(build);

  return {
    context: resolve("./app"),
    target: build === 'native' ? nativescriptTarget : 'web',
    entry,
    output: output,
    resolve: {
      extensions,
      alias: {
        '~': join(__dirname, 'tns', 'app'),
        'vue$': 'vue/dist/vue.esm.js' // WEB
      },

      // Resolve {N} system modules from tns-core-modules
      modules: [
        "node_modules/tns-core-modules",
        "node_modules",
      ]
    },
    node: build === 'native' ?
      {
        // Disable node shims that conflict with NativeScript
        "http": false,
        "timers": false,
        "setImmediate": false,
        "fs": "empty",
      }
      : {},
    module: { rules },
    plugins,
  };
};

function getPlatform(env) {
  if (env.web) {
    return { build: 'web' }
  } else if (env.android) {
    return { build: 'native', platform: 'android' }
  }
  else if (env.ios) {
    return { build: 'native', platform: 'ios' }
  }

  () => { throw new Error("You need to provide a target platform!") };
}

function getRules(build, platform, mainSheet) {
  return [
    {
      test: /\.js$/,
      loader: 'babel-loader',
      include: [resolve('app')]
    },
    {
      test: /\.html$|\.xml$/,
      use: [
        "raw-loader",
      ]
    },
    // Root stylesheet gets extracted with bundled dependencies
    {
      test: new RegExp(mainSheet),
      loader: extractMainSheet.extract([
        {
          loader: "resolve-url-loader",
          options: { silent: true },
        },
        {
          loader: "nativescript-css-loader",
          options: { minimize: false }
        },
        "nativescript-dev-webpack/platform-css-loader",
      ]),
    },
    // Other CSS files get bundled using the raw loader
    {
      test: /\.css$/,
      exclude: new RegExp(mainSheet),
      loader: extractCSS.extract({
        fallback: 'style-loader',
        use: {
          loader: 'css-loader',
          options: { url: false }
        }
      })

    },
    // SASS support
    {
      test: /\.s[a|c]ss$/,
      loader: extractCSS.extract({
        use: [
          {
            loader: 'css-loader',
            options: { url: false }
          },
          'sass-loader'
        ],
        fallback: 'vue-style-loader'
      })

    },
    // .vue single file component support
    {
      test: /\.vue$/,
      loader: 'ns-vue-loader',
      options: {
        build: build,
        platform: platform,
        loaders: {
          css: extractCSS.extract("css-loader"),
          scss: extractCSS.extract({
            use: [
              {
                loader: 'css-loader',
                options: { url: false }
              },
              'sass-loader'
            ],
            fallback: 'vue-style-loader'
          })
        }
      }
    }
  ];
}

function getOutput(build) {
  return Object.assign({
      path: getPath(build),
      filename: "[name].js",
    },
    build === 'native' ?
      {
        pathinfo: true,
        libraryTarget: "commonjs2"
      } : {}
  )
}

function getPath(build) {
  if (build === 'web') {
    return resolve('html/app');
  } else if (build === 'native') {
    return resolve('tns/app');
  } else {
    // tns/app -or- default destination inside platforms/<platform>/...
    return resolve(nsWebpack.getAppPath(platform)); // default webpack build
  }
}

function getPlugins(env, build) {
  let plugins = [
    extractMainSheet,
    extractCSS,

    new MergeFilesPlugin({
      filename: `app.${build}.css`,
      test: /app-[0-1]\.css/,
      deleteSourceFiles: true
    }),

    // Vendor libs go to the vendor.js chunk
    new webpack.optimize.CommonsChunkPlugin({
      name: ["vendor"],
    }),

    // Define useful constants like TNS_WEBPACK
    new webpack.DefinePlugin({
      "global.TNS_WEBPACK": "true",
    }),

    // Copy assets to out dir. Add your own globs as needed.
    new CopyWebpackPlugin([
      //{ from: mainSheet },
      { from: "css/**" },
      { from: "fonts/**" },
      { from: "**/*.jpg" },
      { from: "**/*.png" },
      { from: "**/*.xml" },
    ], { ignore: ["App_Resources/**"] }),

    // Generate a bundle starter script and activate it in package.json
    new nsWebpack.GenerateBundleStarterPlugin([
      "./vendor",
      "./bundle",
    ]),
  ];

  if (env.uglify) {
    plugins.push(new webpack.LoaderOptionsPlugin({ minimize: true }));

    // Work around an Android issue by setting compress = false
    const compress = platform !== "android";
    plugins.push(new webpack.optimize.UglifyJsPlugin({
      mangle: { except: nsWebpack.uglifyMangleExcludes },
      compress,
    }));
  }

  return plugins;
}

// Resolve platform-specific modules like module.android.js
function getExtensions(build, platform) {
  return Object.freeze([
    `.${platform}.js`,
    `.${build}.js`,
    ".js",
    `.${platform}.css`,
    `.${build}.css`,
    ".css",
    `.${platform}.scss`,
    `.${build}.scss`,
    ".scss",
    `.${platform}.vue`,
    `.${build}.vue`,
    ".vue",
  ]);
}
