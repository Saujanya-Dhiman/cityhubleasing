import glob

html_files = glob.glob('*.html')

fix_css = \"\"\"
  <!-- HAMBURGER MENU FIX -->
  <style>
    @media (max-width: 768px) {
      /* Fix containing block issue and background */
      .nav-links {
        position: fixed !important;
        top: 76px !important;
        left: 0 !important;
        width: 100vw !important;
        height: calc(100vh - 76px) !important;
        height: calc(100dvh - 76px) !important;
        background: rgba(10, 10, 15, 0.98) !important;
        bottom: auto !important;
        right: auto !important;
        padding-top: 32px !important;
      }
      
      /* Fix text color in scrolled state so it's readable on dark background */
      nav.scrolled .nav-links > a, 
      nav.scrolled .dropdown > .nav-trigger {
        color: rgba(255, 255, 255, 0.85) !important;
      }
      nav.scrolled .nav-links > a:hover, 
      nav.scrolled .dropdown > .nav-trigger:hover {
        color: var(--gold) !important;
      }
      
      /* Ensure dropdown links are readable */
      .dropdown-panel a, .dropdown-menu a {
        color: rgba(255, 255, 255, 0.75) !important;
      }
      .dropdown-panel a:hover, .dropdown-panel a.active-link,
      .dropdown-menu a:hover, .dropdown-menu a.active-link {
        color: var(--gold) !important;
        background: rgba(212, 168, 83, 0.12) !important;
      }
    }
  </style>
\"\"\"

count = 0
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "<!-- HAMBURGER MENU FIX -->" in content:
        continue
        
    new_content = content.replace("</head>", fix_css + "</head>")
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    count += 1

print(f"Fixed {count} HTML files.")
