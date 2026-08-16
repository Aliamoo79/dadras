# Dadras — AI-assisted judicial case demo

Dadras is a Persian, right-to-left proof of concept that sends each stage of a judicial case-analysis workflow to a real language model. It supports a local Ollama server or an OpenAI-compatible API.

> This is an educational demonstration. Its case data, legal references, and model output have no legal authority and require human review.

## Ubuntu VPS deployment

The recommended production layout is:

```text
Internet → Nginx :80/:443 → Dadras :8787 → Ollama :11434
```

Dadras and Ollama listen only on the VPS loopback interface. Do not expose port `11434` publicly.

### Quick first-time installation

On a fresh Ubuntu or Debian VPS, clone the repository and run the included installer:

```bash
git clone https://github.com/Aliamoo79/dadras.git /opt/dadras
cd /opt/dadras
chmod +x install.sh
./install.sh
```

The installer adds the system prerequisites, installs system-wide Node.js 22 when
the existing Node version is incompatible, builds Dadras, configures Nginx, opens
Nginx in UFW when the firewall is active, and starts the application. You can then
open `http://YOUR_VPS_IP` in a browser. The installer can safely be run again.

To configure a domain during installation, point its DNS record to the VPS and run:

```bash
DOMAIN=dadras.example.com ./install.sh
```

Continue with the Ollama configuration below after it completes. Add HTTPS with
Certbot before entering API keys into the application.

### 1. Manual installation of Node.js, Git, and Nginx

Install Node.js `20.19+` or `22.12+` using your preferred Ubuntu method. Node.js 18 is not supported by the Vite/Rolldown build toolchain. Then confirm:

```bash
node --version
npm --version
git --version
```

Install Nginx:

```bash
sudo apt update
sudo apt install -y nginx curl
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
3. Stops only the previously recorded Dadras server after verifying its PID, working directory, and command.
4. Starts the Express application on `127.0.0.1:8787`.
5. Tests `/api/health` and writes runtime output to `dadras.log`.

After pulling future changes, the complete update is:

```bash
git pull --ff-only
./restart.sh
```

Inspect logs with:

```bash
tail -f dadras.log
```

### 5. Configure Nginx

Copy the included template and replace `dadras.example.com` with your domain or VPS IP:

```bash
sudo cp deploy/dadras.nginx.conf /etc/nginx/sites-available/dadras
sudo nano /etc/nginx/sites-available/dadras
sudo ln -s /etc/nginx/sites-available/dadras /etc/nginx/sites-enabled/dadras
sudo nginx -t
sudo systemctl reload nginx
```

For a domain, add HTTPS using Certbot before sending API keys through the application.

### 6. Configure the model in Dadras

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

## Current workflow

- Ten sequential, specialized model requests across five judicial layers
- Previous agent responses passed into the next agent as context
- Live model output, model identifier, elapsed time, and failure details
- In-app diagnostics page with request IDs, upstream errors, filtering, and bounded recent logs
- Configurable Ollama or OpenAI-compatible provider with connection testing
- Proposed judgment and a mandatory human-review checkpoint
- Persian RTL responsive interface with keyboard and reduced-motion support

OCR/ASR, a real legal RAG database, official citation validation, authentication, and persistent audit trails are not implemented yet. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the system design.
