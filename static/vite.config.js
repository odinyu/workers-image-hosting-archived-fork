import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path';


// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // host: '0.0.0.0',
    // port: 8010, //设置服务启动端口
    // open: false, //设置服务启动时是否自动打开浏览器
    cors: true, //允许跨域
    //设置代理
    proxy: {
      '/query': {
        target: 'https://img.070619.xyz/',
        changeOrigin: true,
        secure: false
      },
      '/api': {
        target: 'https://img.070619.xyz/',
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    rollupOptions: {
        input: {
            index: path.resolve(__dirname, 'index.html'),
            list: path.resolve(__dirname, 'list.html'),
        },
    },
}
})
