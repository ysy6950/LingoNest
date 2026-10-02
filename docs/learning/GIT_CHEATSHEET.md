# Git 常用命令速查

最后更新：2026-10-02

本笔记只包含 LingoNest 当前阶段常用的 Git 操作。遇到新场景时再补充，不要求一次背完。

## 1. 确认当前位置

```powershell
Get-Location
```

LingoNest 的项目根目录是：

```text
D:\Project\LingoNest
```

## 2. 查看状态和历史

```powershell
git status
git log --oneline --decorate --graph --all
git show --stat HEAD
git diff
git diff --staged
```

- `git status`：查看当前分支和未提交变化。
- `git log`：查看提交历史。
- `git show --stat HEAD`：查看最近一次提交修改了哪些文件。
- `git diff`：查看工作区中尚未暂存的变化。
- `git diff --staged`：查看下一次提交准备包含的变化。
- `HEAD`：当前所在分支指向的最新提交。

长输出进入分页查看器时，按 `q` 退出。

## 3. 暂存和提交

```powershell
git add <文件路径>
git commit -m "提交说明"
```

基本流程：

```text
工作区修改
→ git add
暂存区
→ git commit
Git 历史
```

优先指定文件路径，不要在不了解全部变化时直接使用 `git add .`。

常用提交前缀：

```text
feat:     新功能
fix:      修复问题
docs:     文档修改
test:     测试修改
refactor: 不改变功能的代码整理
chore:    工程配置和杂项
```

## 4. 分支操作

```powershell
git branch
git branch --show-current
git switch -c <新分支名>
git switch main
git merge --no-ff <分支名> -m "合并说明"
git branch -d <已合并分支名>
```

- 分支是独立的开发路线。
- `main` 是项目当前的主要稳定路线。
- 新功能通常在临时分支完成，再通过审核合并到 `main`。
- `git branch -d` 只删除分支名称，不会删除已经合并的提交内容。

推荐分支名称：

```text
feat/word-card
fix/local-storage
docs/update-roadmap
test/add-word-cases
```

## 5. 安全撤回尚未提交的操作

```powershell
git restore --staged <文件路径>
git restore <文件路径>
```

- `git restore --staged`：移出暂存区，保留工作区修改。
- `git restore`：丢弃工作区修改，可能无法恢复，执行前必须确认。

不要在不理解后果时使用：

```text
git reset --hard
git clean -fd
强制 push
```

## 6. 远程 GitHub（连接后再使用）

```powershell
git remote -v
git fetch origin
git pull
git push -u origin <分支名>
```

- `remote`：查看远程仓库配置。
- `fetch`：获取远程信息，但不直接改动当前工作内容。
- `pull`：取得远程变化并整合到本地。
- `push`：把本地提交上传到远程仓库。
- Pull Request 是 GitHub 的审核流程，不是本地 Git 命令。

在正式连接 GitHub 后，再实际练习远程分支和 Pull Request。

## 7. LingoNest 提交前检查

每次提交前依次确认：

```powershell
git status
git diff
git diff --staged
```

并检查：

- 是否只包含本次任务相关变化。
- 是否误提交 `.env`、API Key、密码或个人敏感信息。
- 是否混入构建产物和临时文件。
- 提交说明是否能够解释这次变化。
- 当前功能或文档是否已经验证。

## 8. 当前掌握情况

已经实际完成：

- 初始化仓库。
- 查看状态、历史和提交内容。
- 修改 `.gitignore`。
- 创建分支。
- 修改文件并查看差异。
- 暂存并创建提交。
- 合并分支回 `main`。
- 删除已经合并的临时分支。

后续按需学习：

- 连接 GitHub。
- Push、Pull 和 Fetch。
- Pull Request 和代码审核。
- 合并冲突。
- 撤销已经提交的错误。
- Tag 和 Release。

