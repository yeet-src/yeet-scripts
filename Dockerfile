# syntax=docker/dockerfile:1.7-labs
FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        zsh \
        git \
        curl \
        ca-certificates \
        locales \
        fastfetch \
        chafa \
        jp2a \
        imagemagick \
        gnupg \
        sudo \
        procps \
        libelf1 \
        zlib1g \
        bsdextrautils \
        pipx \
        bat \
        tmux \
        make \
        fzf \
        python3-rich \
        vim \
        emacs-nox \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://repo.charm.sh/apt/gpg.key | gpg --dearmor -o /etc/apt/keyrings/charm.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/charm.gpg] https://repo.charm.sh/apt/ * *" > /etc/apt/sources.list.d/charm.list \
    && apt-get update && apt-get install -y --no-install-recommends gum \
    && rm -rf /var/lib/apt/lists/* \
    && sed -i 's/# en_US.UTF-8/en_US.UTF-8/' /etc/locale.gen \
    && locale-gen
ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
ENV TERM=xterm-256color COLORTERM=truecolor
ENV CLICOLOR=1 CLICOLOR_FORCE=1 FORCE_COLOR=1

ARG ZELLIJ_VERSION=0.42.2
RUN ARCH=$(uname -m) && \
    case "$ARCH" in \
        x86_64)  ZARCH=x86_64-unknown-linux-musl  ;; \
        aarch64) ZARCH=aarch64-unknown-linux-musl ;; \
        *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/zellij-org/zellij/releases/download/v${ZELLIJ_VERSION}/zellij-${ZARCH}.tar.gz" \
        | tar -xz -C /usr/local/bin && \
    chmod +x /usr/local/bin/zellij

ARG YEET_CACHEBUST=0
RUN curl -fsSL https://yeet.cx | sh -s -- --no-phone-home

RUN useradd -m -s /bin/zsh you \
 && install -m 0644 -o you -g you /dev/null /var/log/yeetd.log \
 && echo 'you ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/you \
 && chmod 0440 /etc/sudoers.d/you \
 && ln -sf /usr/bin/batcat /usr/local/bin/bat
ENV ASSETS=/opt/logos
COPY --chown=you:you --chmod=755 opt/ /opt/
USER you
WORKDIR /home/you
ENV PATH=/home/you/.local/bin:$PATH

# Frogmouth: TUI markdown browser (used by Space toggle inside the running banger).
RUN pipx install frogmouth

# Skip zellij's first-run wizard / unlock-first mode
RUN mkdir -p /home/you/.config/zellij \
 && printf '%s\n' \
        'default_mode "normal"' \
        'show_startup_tips false' \
        'show_release_notes false' \
        > /home/you/.config/zellij/config.kdl

# Bake yeet-scripts repo into ~ (everything except opt/ which lives at /opt/)
COPY --chown=you:you --exclude=opt --exclude=Dockerfile --exclude=Makefile . /home/you/

RUN chafa --format=symbols --symbols=block   --size=30x15 $ASSETS/logo.png > $ASSETS/logo-block.txt && \
    chafa --format=symbols --symbols=braille --size=35x18 $ASSETS/logo.png > $ASSETS/logo-braille.txt && \
    convert $ASSETS/logo.png -alpha extract -threshold 50% /tmp/sil.png && \
    convert /tmp/sil.png -morphology Erode Disk:5 /tmp/eroded.png && \
    convert /tmp/sil.png /tmp/eroded.png -compose Minus_Src -composite /tmp/ring.png && \
    convert -size 715x669 xc:black $ASSETS/logo.png -composite /tmp/flat.png && \
    convert /tmp/flat.png -colorspace Gray -threshold 99% /tmp/eyes-raw.png && \
    convert -size 715x335 xc:white -size 715x334 xc:black -append /tmp/top.png && \
    convert /tmp/eyes-raw.png /tmp/top.png -compose Multiply -composite -define connected-components:area-threshold=400 -define connected-components:mean-color=true -connected-components 4 -morphology Dilate Disk:10 /tmp/eyes.png && \
    convert /tmp/sil.png -morphology Erode Disk:8 /tmp/inner.png && \
    convert /tmp/inner.png /tmp/top.png -compose Multiply -composite /tmp/upper.png && \
    convert -size 715x669 xc:black -seed 7 +noise Random -channel R -separate -threshold 99% /tmp/noise-tiny.png && \
    convert /tmp/noise-tiny.png -morphology Dilate Disk:6 /tmp/noise.png && \
    convert /tmp/noise.png /tmp/upper.png -compose Multiply -composite /tmp/dots.png && \
    convert /tmp/top.png -negate /tmp/bottom.png && \
    convert /tmp/inner.png /tmp/bottom.png -compose Multiply -composite /tmp/lower-fill.png && \
    convert /tmp/ring.png /tmp/eyes.png -compose Lighten -composite /tmp/step1.png && \
    convert /tmp/step1.png /tmp/dots.png -compose Lighten -composite /tmp/step2.png && \
    convert /tmp/step2.png /tmp/lower-fill.png -compose Lighten -composite /tmp/mask.png && \
    convert /tmp/flat.png -modulate 130,250,100 /tmp/sat.png && \
    convert /tmp/sat.png -modulate 60,100,100 -level 0%,75% /tmp/sat-dim.png && \
    convert -size 715x669 xc:white /tmp/white-canvas.png && \
    convert -size 715x669 xc:"rgb(0,0,255)" /tmp/blue-canvas.png && \
    convert /tmp/flat.png -colorspace Gray -threshold 15% -negate /tmp/dark.png && \
    convert /tmp/dark.png /tmp/eyes.png -compose Multiply -composite -morphology Dilate Disk:2 /tmp/pupils.png && \
    convert /tmp/sat-dim.png /tmp/white-canvas.png /tmp/eyes.png -composite /tmp/sat-with-eyes.png && \
    convert /tmp/sat-with-eyes.png /tmp/blue-canvas.png /tmp/pupils.png -composite /tmp/sat-final.png && \
    convert /tmp/sat-final.png /tmp/mask.png -alpha off -compose CopyOpacity -composite $ASSETS/logo-outline.png && \
    chafa --format=symbols --symbols='ascii-alpha-digit-bad-ugly' --colors=256 --fg-only --color-extractor=median --size=44x21 $ASSETS/logo-outline.png \
      | perl -pe 's/(\e\[38;5;(?:231|21|19|20|27|33)m)./$1@/g' \
      > $ASSETS/logo-ascii.txt && \
    ln -sf $ASSETS/logo-ascii.txt $ASSETS/logo.txt && \
    mkdir -p /home/you/.config/fastfetch && \
    printf '%s\n' \
        '{' \
        '  "logo": {' \
        '    "source": "/opt/logos/logo.txt",' \
        '    "type": "file-raw",' \
        '    "padding": { "right": 2 }' \
        '  },' \
        '  "display": {' \
        '    "color": {' \
        '      "keys": "red",' \
        '      "title": "red",' \
        '      "separator": "yellow",' \
        '      "output": "white"' \
        '    },' \
        '    "separator": " "' \
        '  },' \
        '  "modules": [' \
        '    { "type": "title", "color": { "user": "cyan", "at": "yellow", "host": "green" } },' \
        '    { "type": "separator", "string": "==============" },' \
        '    { "type": "os", "format": "yeet enterprise linux", "keyColor": "red" },' \
        '    { "type": "host", "keyColor": "yellow" },' \
        '    { "type": "kernel", "keyColor": "green" },' \
        '    { "type": "uptime", "keyColor": "cyan" },' \
        '    { "type": "loadavg", "keyColor": "blue" },' \
        '    { "type": "packages", "keyColor": "magenta" },' \
        '    { "type": "shell", "keyColor": "red" },' \
        '    { "type": "terminal", "keyColor": "yellow" },' \
        '    { "type": "cpu", "keyColor": "green" },' \
        '    { "type": "cpuusage", "keyColor": "cyan" },' \
        '    { "type": "memory", "keyColor": "blue" },' \
        '    { "type": "swap", "keyColor": "magenta" },' \
        '    { "type": "disk", "keyColor": "red" },' \
        '    { "type": "localip", "keyColor": "yellow" },' \
        '    { "type": "locale", "keyColor": "green" },' \
        '    { "type": "datetime", "keyColor": "cyan" },' \
        '    "break",' \
        '    "colors"' \
        '  ]' \
        '}' \
        > /home/you/.config/fastfetch/config.jsonc

ENV ZSH=/home/you/.oh-my-zsh
ENV ZSH_CUSTOM=$ZSH/custom

RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended \
 && git clone --depth=1 https://github.com/romkatv/powerlevel10k.git           $ZSH_CUSTOM/themes/powerlevel10k \
 && git clone --depth=1 https://github.com/zsh-users/zsh-autosuggestions       $ZSH_CUSTOM/plugins/zsh-autosuggestions \
 && git clone --depth=1 https://github.com/zsh-users/zsh-syntax-highlighting   $ZSH_CUSTOM/plugins/zsh-syntax-highlighting \
 && git clone --depth=1 https://github.com/zsh-users/zsh-completions           $ZSH_CUSTOM/plugins/zsh-completions \
 && $ZSH_CUSTOM/themes/powerlevel10k/gitstatus/install -f

RUN sed -i 's|^ZSH_THEME=.*|ZSH_THEME="powerlevel10k/powerlevel10k"|' ~/.zshrc \
 && sed -i 's|^plugins=.*|plugins=(git docker zsh-autosuggestions zsh-syntax-highlighting zsh-completions)|' ~/.zshrc \
 && cp $ZSH_CUSTOM/themes/powerlevel10k/config/p10k-rainbow.zsh ~/.p10k.zsh \
 && echo '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' >> ~/.zshrc \
 && echo 'ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=244"' >> ~/.zshrc \
 && echo 'alias logo-ascii="ln -sf /opt/logos/logo-ascii.txt /opt/logos/logo.txt && fastfetch"' >> ~/.zshrc \
 && echo 'alias logo-braille="ln -sf /opt/logos/logo-braille.txt /opt/logos/logo.txt && fastfetch"' >> ~/.zshrc \
 && echo 'alias logo-block="ln -sf /opt/logos/logo-block.txt /opt/logos/logo.txt && fastfetch"' >> ~/.zshrc

# Collapse rainbow preset to a single line
RUN cat >> ~/.p10k.zsh <<'EOF'

# --- single-line override: collapse rainbow to one line ---
typeset -g POWERLEVEL9K_LEFT_PROMPT_ELEMENTS=(os_icon context dir vcs prompt_char)
typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_PREFIX=
typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_PREFIX=
typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_PREFIX=
typeset -g POWERLEVEL9K_MULTILINE_FIRST_PROMPT_SUFFIX=
typeset -g POWERLEVEL9K_MULTILINE_NEWLINE_PROMPT_SUFFIX=
typeset -g POWERLEVEL9K_MULTILINE_LAST_PROMPT_SUFFIX=
typeset -g POWERLEVEL9K_PROMPT_ADD_NEWLINE=false
EOF

ENTRYPOINT ["/opt/scripts/entry.sh"]
