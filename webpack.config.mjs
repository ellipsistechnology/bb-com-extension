import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import nodeExternals from 'webpack-node-externals';

// __dirname is not available in ES Modules, so we need to recreate it.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read dependencies from package.json to exclude them from the bundle
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const dependencies = Object.keys(pkg.dependencies || {});
const peerDependencies = Object.keys(pkg.peerDependencies || {});
const externals = dependencies.concat(peerDependencies);

export default {
  // Sets the bundling mode.
  mode: 'development',
  // IMPORTANT: Set `devtool` to `false` to disable the `eval` source map.
  devtool: false,
  // Enable experimental module output
  experiments: {
    outputModule: true,
  },
  // Your module's main entry point.
  entry: './dist/index.js',
  // How the module is outputted.
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'bundle'),
    // IMPORTANT: Set the library type to 'module' for ESM output
    library: {
      type: 'module',
    },
    // Explicitly set chunk format to module for a clean build
    chunkFormat: 'module',
  },
  // Tells Webpack to handle .ts and .js files.
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  // Specifies the target environment as Node.js.
  target: 'node23',
  // Exclude external dependencies from the bundle.
  externals: [
    nodeExternals(),
    ...externals,
  ],
  // Optionally, add optimization settings for readability.
  optimization: {
    // Disable minification for readable output.
    minimize: false,
  },
};
