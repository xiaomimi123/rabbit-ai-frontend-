import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/': {
            target: env.VITE_API_URL || 'http://localhost:3001',
            changeOrigin: true,
            secure: false,
            rewrite: (path) => path.replace(/^\/api/, ''),
          },
        },
      },
      plugins: [
        react(),
        nodePolyfills({
          globals: {
            Buffer: true,
            global: true,
            process: true,
          },
        }),
        // 🟢 新增：Legacy 插件 - 解决 BigInt 兼容性问题（支持 Android 5.0+）
        legacy({
          targets: [
            'Android >= 5.0',
            'Chrome >= 60',
            'Safari >= 10.1',
            'iOS >= 10.3',
            'Firefox >= 60',
            'Edge >= 79',
          ],
          // 现代浏览器不需要 polyfills，只生成 legacy 版本
          modernPolyfills: false,
          // 渲染 legacy 脚本（使用 nomodule）
          renderLegacyChunks: true,
          // 使用 terser 压缩（已安装）
          terserOptions: {
            compress: {
              drop_console: mode === 'production',
            },
          },
        }),
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'global': 'globalThis',
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      optimizeDeps: {
        esbuildOptions: {
          define: {
            global: 'globalThis',
          },
        },
      },
      build: {
        chunkSizeWarningLimit: 1000, // 设置块大小警告限制为 1000 KB
        rollupOptions: {
          output: {
            manualChunks: {
              // 将大型依赖分离到单独的 chunk
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              'vendor-ethers': ['ethers'],
              'vendor-walletconnect': ['@walletconnect/ethereum-provider', '@walletconnect/modal'],
            },
          },
        },
        // 生产环境移除 console 调用（保留 console.error）
        minify: 'esbuild',
      },
      esbuild: {
        // 生产环境移除 console.log, console.warn, console.info, console.debug, console.trace
        // 但保留 console.error（用于关键错误日志）
        drop: mode === 'production' ? ['console', 'debugger'] : [],
      },
    };
});
