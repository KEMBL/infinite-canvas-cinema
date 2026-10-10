# Cinema fork changes

## 0.1.8

- Use independent extension ID `kembl.infinite-canvas-cinema`, publisher `kembl`, and separate editor/command/language/setting identifiers.
- Document migration from the shared upstream ID and enabling only one canvas extension at a time.

## 0.1.7

- Integrate the 0.1.6 image/tag patch with a reconstructed TypeScript host.
- Add captions, tag editing/suggestions, clipboard copying, and JSON/YAML export.
- Fix workspace path handling, source-field preservation, zero coordinates, dangling edges, export protection, tag validation, and YAML string types.
- Use canvas-specific export filenames with an explicit legacy option.
- Fix initial webview content loading and redundant saves; retain the upstream extension ID for installation compatibility.

# Changelog

All notable changes to the "Infinite Canvas" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2025-01-08

### Fixed
- 🔧 **File Path Handling**
  - Fixed file path handling to use only relative paths in .canvas files
  - Resolved doubled path issue that prevented loading files from subdirectories
  - Improved path conversion logic to preserve directory structure (e.g., "Clippings/file.md")
  - Fixed compatibility with existing canvas files containing problematic absolute paths

### Changed
- 🔄 **Path Architecture**
  - Simplified file path architecture to consistently use workspace-relative paths
  - Enhanced path normalization for better cross-platform compatibility
  - Removed backward compatibility for absolute paths (MVP approach)

## [0.1.1] - 2024-12-21

### Fixed
- Minor bug fixes and stability improvements

## [0.1.0] - 2024-12-20

### Added
- 🎨 **Visual Canvas Editor**
  - Infinite workspace for creating and organizing content
  - Intuitive double-click to create, drag to move interactions
  - Node-based editing with text nodes and visual connections
  - Smooth pan and zoom navigation
  - File integration via drag & drop from VS Code explorer

- 🤖 **AI-Powered Content Generation**
  - Integration with multiple AI models via OpenRouter (Google Gemini, OpenAI GPT-4, Anthropic Claude, and more)
  - Smart context-aware idea generation
  - OpenRouter API integration with mock fallback
  - Connected node expansion based on conversation history

- 📝 **Rich Text & Markdown Support**
  - Full markdown rendering with headings (# ## ### #### ##### ######)
  - Bold (**bold**) and italic (*italic*) text formatting
  - List support (- and * for bullets, numbered lists)
  - Live markdown preview in canvas nodes
  - Direct markdown file editing via double-click

- 🔗 **Obsidian Canvas Compatibility**
  - Native .canvas file format support (compatible with [Obsidian Canvas](https://obsidian.md/canvas))
  - Bidirectional compatibility with Obsidian
  - Import/export existing Obsidian canvas files
  - Perfect sync between VS Code and Obsidian

- ⚡ **Enhanced User Experience**
  - Keyboard shortcuts (Delete, Ctrl+Enter, Esc)
  - Clipboard operations support (Cmd+A, Cmd+C, Cmd+V)
  - Auto-save functionality
  - Smooth animations and interactions
  - Dark theme support

### Technical
- TypeScript implementation with VS Code Extension API
- Custom webview editor for .canvas files
- Real-time state synchronization with VS Code
- Extensible architecture for future enhancements

### Known Issues
- AI features require internet connection
- Large canvases may impact performance on older machines

---

## [Unreleased]

### Planned Features
- 📊 Additional node types (images, code blocks, tables)
- 🎨 Themes and customization options
- 📱 Mobile responsive design
- 🔄 Real-time collaboration
- 📈 Analytics and usage insights
- 🎯 Template gallery
- 🔍 Search functionality across canvas content