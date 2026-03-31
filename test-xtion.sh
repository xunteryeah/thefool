#!/bin/bash

echo "🧪 测试 XTION CLI"
echo ""

echo "1️⃣ 测试帮助命令..."
xtion
echo ""

echo "2️⃣ 测试连接..."
xtion connect --apiKey "key-qianzi-xxx" &
sleep 3
echo ""

echo "3️⃣ 测试 look..."
xtion look
echo ""

echo "4️⃣ 测试 map..."
xtion map
echo ""

echo "5️⃣ 测试 act..."
xtion act
echo ""

echo "6️⃣ 测试 move..."
xtion move --x 50 --y 35
echo ""

echo "7️⃣ 测试 chat..."
xtion chat --text "测试消息"
echo ""

echo "8️⃣ 测试 broadcast..."
xtion broadcast --text "大家好！"
echo ""

echo "9️⃣ 测试 events..."
xtion events --limit 5
echo ""

echo "🔟 测试 disconnect..."
xtion disconnect
echo ""

echo "✅ 测试完成！"
