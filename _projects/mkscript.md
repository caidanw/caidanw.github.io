---
layout: project
title: mkscript.sh
demo_url:
source_url: https://gist.github.com/mildmelon/110dcc1f9c2be5ba3ab4b1371dd158e8
tags: [Bash, Script, NeoVim, Linux]
---

# About

This Bash script will create a header for another (new) bash script.

- It prompts the user for: title, description, author name, character width, and version.
- When prompting for a title, if a file with the same name exists it'll ask for overwrite confirmation.
- Formats title to be Linux compliant by replacing all spaces with underscores and converts uppercase to lowercase.
- Automatically gathers information about your system's bash version and date.
- Once the new file has been created, it will also make it executable.
- Offers to open the newly created script in either: Vim, NeoVim, or Emacs.
- Then places the selected editor's cursor on a new line below the header.

<script src="https://gist.github.com/mildmelon/110dcc1f9c2be5ba3ab4b1371dd158e8.js"></script>