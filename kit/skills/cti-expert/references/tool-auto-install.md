# Tool Auto-Install Policy

External CLI tools are installed on demand rather than assumed. This is what
keeps a missing dependency from becoming an investigation blocker — the analyst
never stalls, and the gap is logged rather than hidden.

**Before running any CLI tool, check if it exists on the system. If not, install it automatically and silently.** This ensures zero-friction investigation — the analyst never stalls on missing dependencies.

### Auto-Install Protocol

1. **Check:** `command -v <tool> >/dev/null 2>&1` (or `python -m <module> --help` for Python modules)
2. **Install:** If missing, run the install command from the table below
3. **Verify:** Confirm installation succeeded before proceeding
4. **Log:** Note `[auto-installed]` in the finding's collection method tag
5. **Continue:** Proceed with the investigation — never block on tool availability

### Install Commands by Tool

| Tool | Check Command | Install Command |
|------|--------------|-----------------|
| Maigret | `command -v maigret` | `pip3 install maigret` |
| Sherlock | `command -v sherlock` | `pipx install sherlock-project` |
| Blackbird | `command -v blackbird` | `pip3 install blackbird-osint` |
| PhoneInfoga | `command -v phoneinfoga` | `go install github.com/sundowndev/phoneinfoga/v2/cmd/phoneinfoga@latest` |
| Holehe | `command -v holehe` | `pip3 install holehe` |
| h8mail | `command -v h8mail` | `pip3 install h8mail` |
| theHarvester | `command -v theHarvester` | `pip3 install theHarvester` |
| TruffleHog | `command -v trufflehog` | `pip3 install trufflehog` |
| Gitleaks | `command -v gitleaks` | `go install github.com/gitleaks/gitleaks@latest` |
| Subfinder | `command -v subfinder` | `go install github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest` |
| Amass | `command -v amass` | `go install github.com/owasp-amass/amass/v4/...@master` |
| GAU | `command -v gau` | `go install github.com/lc/gau/v2/cmd/gau@latest` |
| Xeuledoc | `command -v xeuledoc` | `pip3 install xeuledoc` |
| MSFTRecon | `command -v msftrecon` | `pip3 install git+https://github.com/Arcanum-Sec/msftrecon.git` |
| ShareTrace | `python -m sharetrace --help 2>/dev/null` | `git clone https://github.com/7onez/sharetrace.git && cd sharetrace && pip3 install -r requirements.txt` |
| exiftool | `command -v exiftool` | `apt install -y libimage-exiftool-perl` |
| pdfinfo | `command -v pdfinfo` | `apt install -y poppler-utils` |
| oletools | `python -c "import oletools" 2>/dev/null` | `pip3 install oletools` |
| qpdf | `command -v qpdf` | `apt install -y qpdf` |
| mat2 | `command -v mat2` | `apt install -y mat2` |
| whois | `command -v whois` | `apt install -y whois` |
| dig | `command -v dig` | `apt install -y dnsutils` |
| jq | `command -v jq` | `apt install -y jq` |
| ASN | `command -v asn` | `bash <(curl -sL https://raw.githubusercontent.com/nitefood/asn/master/asn)` |
| Waymore | `command -v waymore` | `pip3 install waymore` |
| Pandoc | `command -v pandoc` | `apt install -y pandoc` |
| whoisdomain | `python -c "import whoisdomain" 2>/dev/null` | `pip3 install whoisdomain` |
| Scrapling | `python -c "import scrapling" 2>/dev/null` | `pip3 install scrapling` |
| Scrapling (full) | `python -c "from scrapling.fetchers import StealthyFetcher" 2>/dev/null` | `pip3 install "scrapling[fetchers]" && scrapling install` |
| AgentFlow | `python -c "import agentflow" 2>/dev/null` | `pip3 install agentflow-py` |

### Behavior Rules

- **Silent install:** Do not ask permission — install and proceed. Tool installation is a normal part of the investigation workflow.
- **pip vs pipx:** Use `pip` by default. Use `pipx` only for tools that explicitly require it (Sherlock).
- **Go tools:** Require Go installed. If `command -v go` fails, note the gap and fall back to next tool in cascade.
- **apt tools:** May require root. Use `sudo apt install -y` if not running as root.
- **Git-based install:** For tools without PyPI packages (ShareTrace), clone the repo and install dependencies via `git clone ... && cd ... && pip3 install -r requirements.txt`
- **Fallback on install failure:** If installation fails, skip to the next tool in the cascade — never block the investigation.
