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
        // 🔥 使用 Terser 进行压缩，强制删除调试日志
        minify: 'terser',
        terserOptions: {
          compress: {
            // 🟢 删除所有 console 调用（除了 console.error）
            drop_console: true,
            drop_debugger: true,
            pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.warn'],
          },
        },
      },
      esbuild: {
        // 开发环境也移除调试日志
        pure: ['console.log', 'console.info', 'console.debug', 'console.warn'],
        drop: ['debugger'],
      },
    };
});
