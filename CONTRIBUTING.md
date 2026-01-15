# Contributing to aiwebengine-examples

Thank you for your interest in contributing! This project is experimental and we're learning open source development together. All types of contributions are welcome.

## Getting Started

1. Fork the repository on GitHub
2. Clone your fork locally:

   ```bash
   git clone https://github.com/YOUR_USERNAME/aiwebengine-examples.git
   cd aiwebengine-examples
   ```

3. Set up your development environment:

   ```bash
   npm install
   cp .env.example .env
   # Configure your .env file
   ```

## What Can I Contribute?

We welcome all kinds of contributions:

- 🐛 **Bug reports** - Found something broken? Let us know!
- 💡 **Feature requests** - Have an idea? Share it!
- 📝 **Documentation** - Improvements, corrections, or new guides
- 🔧 **Code fixes** - Bug fixes, performance improvements
- ✨ **New features** - New tools, utilities, or examples
- 🧪 **Tests** - Help us improve test coverage
- 🎨 **Examples** - Real-world usage examples

## How to Contribute

### Reporting Issues

1. Check if the issue already exists in the [Issues](https://github.com/lpajunen/aiwebengine-examples/issues) section
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce (for bugs)
   - Expected vs actual behavior
   - Your environment details (Node.js version, OS, etc.)

### Submitting Changes

1. Create a new branch for your work:

   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. Make your changes:
   - Write clear, readable code
   - Follow existing code style
   - Add comments where helpful
   - Update documentation if needed

3. Test your changes:

   ```bash
   npm run fetch-types
   npm run fetch-graphql-schema
   # Test any affected functionality
   ```

4. Commit your changes:

   ```bash
   git add .
   git commit -m "Brief description of your changes"
   ```

   - Use clear commit messages
   - Reference issue numbers if applicable (e.g., "Fix #123")

5. Push to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a Pull Request:
   - Go to the [repository](https://github.com/lpajunen/aiwebengine-examples) on GitHub
   - Click "New Pull Request"
   - Select your branch
   - Describe your changes clearly
   - Link any related issues

## Code Style Guidelines

- Use consistent indentation (2 spaces)
- Follow existing JavaScript/Node.js conventions
- Use meaningful variable and function names
- Add JSDoc comments for functions when helpful
- Run `prettier` to format code:

  ```bash
  make format
  # or
  ./node_modules/.bin/prettier --write "**/*.js" "**/*.md"
  ```

## Documentation Guidelines

- Use clear, simple language
- Include code examples where helpful
- Update the README if adding new features
- Keep examples working and tested
- Use proper Markdown formatting

## Environment Variables

When adding new features that require configuration:

- Add variables to `.env.example` with documentation
- Use sensible defaults in the code
- Document the variable in README.md

## Questions?

- Open a [Discussion](https://github.com/lpajunen/aiwebengine-examples/discussions) for questions
- Create an [Issue](https://github.com/lpajunen/aiwebengine-examples/issues) for problems
- Contact the maintainer: [@lpajunen](https://github.com/lpajunen)

## Code of Conduct

Be respectful, welcoming, and constructive. We're all learning together:

- Use welcoming and inclusive language
- Be respectful of differing viewpoints
- Accept constructive criticism gracefully
- Focus on what's best for the community
- Show empathy towards other community members

## License

By contributing, you agree that your contributions will be licensed under the same [AGPL-3.0 License](LICENSE) that covers the project.

## Thank You!

Every contribution, no matter how small, helps improve this project. We appreciate your time and effort! 🙏
