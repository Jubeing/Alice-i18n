# Alice-Longbridge

OpenAlice 的中文本地化补丁包 + Longbridge 券商集成。

## 安装方式

```bash
# 1. 克隆 OpenAlice
git clone https://github.com/TraderAlice/OpenAlice.git
cd OpenAlice

# 2. 设置 Alice-Longbridge 路径（补丁包根目录）
export ALICE_LONGBRIDGE_ROOT=/path/to/Alice-Longbridge

# 3. 应用补丁（workspace 包 + i18n 翻译 + systemd 服务）
node packages/longport/scripts/apply-patch.ts

# 4. 安装依赖 + 构建
pnpm install
pnpm build

# 5. 重载新构建
sudo systemctl restart openalice
```

> 应用补丁后 OpenAlice 会自动注册为 systemd 服务，开机自动运行、崩溃自动恢复。

## 包含内容

### 工作区包（packages/）
| 包 | 说明 |
|----|------|
| `i18n` | OpenAlice UI 中文本地化（所有页面翻译） |
| `longport` | Longbridge 券商适配器 + MCP 服务器 |
| `opentypebb` | OpenBB 数据集成 |
| `ibkr` | IBKR 券商适配器 |

### 补丁覆盖的源文件
- `src/domain/trading/brokers/` — 券商注册与索引
- `ui/src/` — UI 翻译覆盖

## 目录结构

```
packages/longport/
├── src/                    # Broker 源码（LongbridgeBroker 等）
├── mcp/                    # MCP 服务器入口（longport-mcp 合并）
│   └── index.ts
├── dist-mcp/               # MCP 构建输出（systemd 引用此路径）
├── systemd/
│   └── openalice.service   # systemd 服务
├── scripts/
│   ├── apply-patch.ts      # 安装补丁（含 i18n 翻译）
│   ├── remove-patch.ts     # 卸载补丁
│   └── refresh-token.ts    # Token 每月 1 号自动刷新
├── tsup.config.ts          # Broker 构建配置
└── README.md
```

## systemd 服务

```bash
sudo systemctl status openalice   # 查看状态
sudo journalctl -u openalice -f   # 查看日志
sudo systemctl restart openalice  # 重启
sudo systemctl stop openalice     # 停止
```

## Longbridge Token 自动刷新

Access Token 有效期约 90 天，系统会在**每月 1 号凌晨 4 点**自动刷新所有 Longbridge 账户的 Token。

### Crontab 设置
```bash
# 编辑 crontab
crontab -e

# 添加以下行：
0 3 1 * * cd /home/ubuntu/OpenAlice && node packages/longport/scripts/refresh-token.ts >> ~/.openclaw/logs/longbridge_refresh.log 2>&1
```

### 手动刷新 Token
在 Trading → 编辑账户 → 找到 LONGBRIDGE_ACCESS_TOKEN 字段旁边的 ↻ 按钮即可手动刷新。

## i18n 翻译

补丁安装时自动应用所有 i18n 翻译，包括：
- 所有 UI 页面（Trading、Settings、AI Provider 等）
- 中文（zh）和英文（en）语言文件
- 语言切换器

## 卸载

```bash
node packages/longport/scripts/remove-patch.ts
pnpm build
sudo systemctl restart openalice
```

## 依赖
- Node.js 20+
- pnpm
- Longbridge OpenAPI 账号: https://open.longbridge.com/en/
