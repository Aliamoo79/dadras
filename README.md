# Dadras — AI-assisted judicial case demo

Dadras is a Persian, right-to-left proof of concept that sends each stage of a judicial case-analysis workflow to a real language model. It supports a local Ollama server or an OpenAI-compatible API.

> This is an educational demonstration. Its case data, legal references, and model output have no legal authority and require human review.

## Ubuntu VPS deployment

The production layout is:

```text
Internet → Dadras :8012 → model API
```

Dadras is managed by PM2 and listens directly on the configured application port. Do not expose Ollama port `11434` publicly.

### Quick first-time installation

On a fresh Ubuntu or Debian VPS, clone the repository and run the included installer:

```bash
git clone https://github.com/Aliamoo79/dadras.git /opt/dadras
cd /opt/dadras
chmod +x install.sh
./install.sh
```

The installer adds the system prerequisites, installs system-wide Node.js 22 when
the existing Node version is incompatible, builds Dadras, registers PM2 for reboot
recovery, opens the application port in UFW when active, and starts the application.
You can then open `http://YOUR_VPS_IP:8012`. The installer can safely be run again.

Choose a different port when needed:

```bash
PORT=8787 ./install.sh
```

Continue with the model configuration below after it completes. Direct access is
plain HTTP; do not enter sensitive production credentials without adding a secure
authenticated network layer.

### 1. Manual installation of Node.js and Git

Install Node.js `20.19+` or `22.12+` using your preferred Ubuntu method. Node.js 18 is not supported by the Vite/Rolldown build toolchain. Then confirm:

```bash
node --version
npm --version
git --version
```

Install the base tools:

```bash
sudo apt update
sudo apt install -y git curl
```

### 2. Clone the application

```bash
git clone https://github.com/Aliamoo79/dadras.git
cd dadras
chmod +x restart.sh
```

### 3. Install Ollama and Gemma

Install Ollama using its official Linux instructions, then pull a Gemma model that fits the VPS memory:

```bash
ollama pull gemma3:4b
ollama list
```

If your model is named `gemma4` or something else, use the exact value shown by `ollama list` in the Dadras settings screen.

### 4. Build or restart after every change

Run:

```bash
./restart.sh
```

The script performs these actions:

1. Installs exactly the dependencies in `package-lock.json` with `npm ci`.
2. Creates the production frontend with `npm run build`.
3. Safely removes a legacy `nohup` Dadras process when upgrading an older installation.
4. Starts or reloads the Express application with the project-local PM2 installation.
5. Saves the PM2 process list and verifies `/api/health`.

Register PM2 once so the saved Dadras process returns automatically after a VPS reboot:

```bash
sudo env PATH="$PATH" "$PWD/node_modules/.bin/pm2" startup systemd -u "$USER" --hp "$HOME"
./node_modules/.bin/pm2 save
```

After pulling future changes, the complete update is:

```bash
git pull --ff-only
./restart.sh
```

Inspect logs with:

```bash
./node_modules/.bin/pm2 logs dadras
```

Check or control the process with `./node_modules/.bin/pm2 status`, `restart dadras`, and `stop dadras`.

### 5. Configure the model in Dadras

Open your domain or VPS IP, select **LLM settings**, choose **Local model**, and enter:

```text
Service URL: http://127.0.0.1:11434
Model: gemma3:4b
```

Click **Test connection**. This URL is resolved by the Dadras server on the VPS, not by the visitor's browser.

## OpenAI-compatible API

Select **Compatible API** and provide the base URL, model identifier, and API key. The key remains in browser memory and is sent to the Dadras gateway for each request; it is not written to localStorage. For a serious deployment, move provider credentials entirely into server environment variables and add authentication to Dadras.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` to the local gateway at `http://127.0.0.1:8787`.

## Direct IP and port access without Nginx

The server uses `127.0.0.1:8787` by default. To listen on every network interface and access Dadras directly, run:

```bash
HOST=0.0.0.0 PORT=8787 ./restart.sh
```

Then open `http://YOUR_SERVER_IP:8787`. If UFW is active, allow only this application port:

```bash
sudo ufw allow 8787/tcp
```

Do not expose Ollama port `11434`. Direct public access has no authentication in this demo, including its diagnostics page, so restrict port `8787` to trusted source IPs when possible.

## Current workflow

- Ten sequential, specialized model requests across five judicial layers
- Previous agent responses passed into the next agent as context
- Live streamed model output with a brief preview on every agent step, model identifier, elapsed time, and failure details
- In-app diagnostics page with request IDs, upstream errors, filtering, and bounded recent logs
- Persistent TXT/Markdown legal knowledge library with lexical passage retrieval for the RAG agent
- Configurable Ollama or OpenAI-compatible provider with connection testing
- Proposed judgment and a mandatory human-review checkpoint
- Persian RTL responsive interface with keyboard and reduced-motion support

Add references from the in-app `پایگاه قوانین` page. Uploaded `.txt` and `.md` content is stored under `knowledge/user/` and is searched automatically on every RAG-agent run. A starter Iranian contract-law reference is included in `knowledge/iranian-contract-law.md`.

The supplied Civil Code and Constitution PDFs are preprocessed into page- and article-aware chunks in `knowledge/pdf-index.json`. Rebuild this index after replacing either PDF:

```bash
npm run knowledge:index
```

OCR/ASR, semantic/vector retrieval, automatic official-citation validation, authentication, and persistent audit trails are not implemented yet. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design.
