#!/usr/bin/env python3
# Render a markdown file with a punchy color theme that matches the banger
# picker palette (bright green + bright magenta). Used as the fzf --preview
# command in pick.sh.

import os
import sys

from rich.console import Console
from rich.markdown import Markdown
from rich.theme import Theme

theme = Theme({
    "markdown.h1":           "bold bright_magenta",
    "markdown.h1.border":    "bright_magenta",
    "markdown.h2":           "bold bright_green",
    "markdown.h3":           "bold bright_cyan",
    "markdown.h4":           "bold bright_yellow",
    "markdown.h5":           "bold bright_blue",
    "markdown.h6":           "bold bright_red",
    "markdown.item.bullet":  "bold bright_magenta",
    "markdown.item.number":  "bold bright_green",
    "markdown.code":         "bold bright_cyan",
    "markdown.link":         "underline bright_blue",
    "markdown.link_url":     "italic dim cyan",
    "markdown.strong":       "bold bright_white",
    "markdown.em":           "italic bright_yellow",
    "markdown.block_quote":  "italic bright_black",
    "markdown.hr":           "bright_magenta",
})

path = sys.argv[1]
width = int(os.environ.get("FZF_PREVIEW_COLUMNS", "80"))

console = Console(
    theme=theme,
    force_terminal=True,
    color_system="truecolor",
    width=width,
)

with open(path, encoding="utf-8") as f:
    console.print(Markdown(f.read(), code_theme="dracula"))
