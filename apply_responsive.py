import glob

html_files = glob.glob('*.html')

responsive_css = """
  <!-- RESPONSIVE FIXES -->
  <style>
    /* Prevent horizontal scrolling globally */
    html, body {
      max-width: 100%;
      overflow-x: hidden;
    }

    * {
      box-sizing: border-box;
    }

    img, video, iframe {
      max-width: 100%;
      height: auto;
    }

    /* Fix navigation & dropdown flickering */
    @media (max-width: 768px) {
      .nav-links {
        width: 100% !important;
        box-sizing: border-box !important;
        padding-left: 24px !important;
        padding-right: 24px !important;
        padding-bottom: 40px !important; /* Touch friendly bottom space */
        overflow-y: auto !important;
      }

      .dropdown-panel, .dropdown-menu {
        position: static !important;
        transform: none !important;
        box-shadow: none !important;
        border: none !important;
        background: transparent !important;
        display: none !important;
        flex-direction: column !important;
        margin-top: 8px !important;
        width: 100% !important;
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }

      .dropdown.open .dropdown-panel,
      .dropdown.active .dropdown-menu,
      .dropdown:hover .dropdown-panel,
      .dropdown:hover .dropdown-menu,
      .dropdown-menu.show {
        display: flex !important;
      }

      .dropdown-panel a, .dropdown-menu a {
        justify-content: flex-start !important;
        padding: 14px 16px !important; /* Larger touch targets */
        border-bottom: 1px solid rgba(255,255,255,0.06) !important;
      }

      /* Fix overlapping and grid layouts on mobile */
      .spaces-grid, .locations-grid, .admin-grid, .features-layout, .footer-top {
        grid-template-columns: 1fr !important;
      }

      .hero-inner, .section, .container {
        padding-left: 5% !important;
        padding-right: 5% !important;
        max-width: 100% !important;
        overflow-x: hidden !important;
      }
      
      .cta-actions {
        flex-direction: column !important;
        align-items: stretch !important;
      }
      
      .btn-primary, .btn-ghost {
        text-align: center !important;
        justify-content: center !important;
        padding: 16px !important;
      }
      
      .hero-actions {
        flex-direction: column !important;
        align-items: stretch !important;
      }
    }
  </style>
</head>"""

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if "<!-- RESPONSIVE FIXES -->" in content:
        print(f"Already injected into {file}")
        continue
        
    new_content = content.replace("</head>", responsive_css)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Injected into {file}")
