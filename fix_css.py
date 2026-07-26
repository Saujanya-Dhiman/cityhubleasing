import os
import glob

html_files = glob.glob('*.html')

target = """      .dropdown-menu {
        position: static;
        transform: none;
        box-shadow: none;
        border: none;
        background: var(--bg);
        display: none;
      }"""

replacement = """      .dropdown-menu {
        position: static;
        transform: none !important;
        box-shadow: none;
        border: none;
        background: var(--bg);
        display: none;
      }

      .dropdown-menu a {
        justify-content: center;
      }"""

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if target in content:
        content = content.replace(target, replacement)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {file}")
    else:
        print(f"No match found in {file}")
