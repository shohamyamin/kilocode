import * as fs from "fs"
import * as path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const rootDir = path.join(__dirname, "..")
const brandingPath = path.join(__dirname, "branding.json")

interface BrandingConfig {
	name: string
	displayName: string
	publisher: string
	description: string
	outputChannelName: string
	repository: string
	homepage: string
	files?: {
		package?: string
		nls?: string
	}
	icons?: Record<string, string>
}

async function main() {
	if (!fs.existsSync(brandingPath)) {
		console.error("branding.json not found in rebranding directory.")
		process.exit(1)
	}

	const branding: BrandingConfig = JSON.parse(fs.readFileSync(brandingPath, "utf8"))
	console.log("Applying branding:", branding.name)

	// 1. Update src/package.json
	// Use configured path or default to src/package.json
	const relativePackagePath = branding.files?.package || "src/package.json"
	const packageJsonPath = path.join(rootDir, relativePackagePath)

	if (fs.existsSync(packageJsonPath)) {
		let packageJsonContent = fs.readFileSync(packageJsonPath, "utf8")

		// Helper to replace all occurrences of a string
		const replaceAll = (str: string, find: string, replace: string) => {
			return str.split(find).join(replace)
		}

		// Perform global replacements for IDs and references
		// "kilo-code" -> branding.name
		packageJsonContent = replaceAll(packageJsonContent, "kilo-code", branding.name)

		// "kilocode" -> branding.publisher
		// Be careful not to replace it if it's part of branding.name being "jack-code" -> "jacjackcode" if overlap?
		// branding.name="jack-code", branding.publisher="jackcode".
		// "kilo-code" -> "jack-code". "kilocode" -> "jackcode". No overlap usually.
		packageJsonContent = replaceAll(packageJsonContent, "kilocode", branding.publisher)

		const packageJson = JSON.parse(packageJsonContent)

		// Ensure top-level fields are exactly as configured (in case they didn't match the replacement pattern)
		packageJson.name = branding.name
		packageJson.publisher = branding.publisher
		packageJson.description = branding.description

		if (branding.repository) {
			packageJson.repository = {
				type: "git",
				url: branding.repository,
			}
		}
		if (branding.homepage) {
			packageJson.homepage = branding.homepage
		}

		// Also update activationEvents to match new view IDs if they use the pattern
		// (The string replace handles "onView:kilo-code.SidebarProvider" -> "onView:jack-code.SidebarProvider")

		fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, "\t") + "\n")
		console.log(`Updated ${relativePackagePath}`)
	} else {
		console.error(`${relativePackagePath} not found`)
	}

	// 2. Update src/package.nls.json
	const relativeNlsPath = branding.files?.nls || "src/package.nls.json"
	const nlsPath = path.join(rootDir, relativeNlsPath)

	if (fs.existsSync(nlsPath)) {
		const nls = JSON.parse(fs.readFileSync(nlsPath, "utf8"))

		nls["extension.displayName"] = branding.displayName
		nls["extension.description"] = branding.description
		nls["views.activitybar.title"] = branding.displayName
		nls["views.sidebar.name"] = branding.displayName
		nls["configuration.title"] = branding.displayName
		nls["views.contextMenu.label"] = branding.displayName
		nls["views.terminalMenu.label"] = branding.displayName

		fs.writeFileSync(nlsPath, JSON.stringify(nls, null, "\t") + "\n")
		console.log(`Updated ${relativeNlsPath}`)
	} else {
		console.error(`${relativeNlsPath} not found`)
	}

	// 3. Update Icons
	if (branding.icons) {
		const iconsDir = path.join(rootDir, "src", "assets", "icons")
		if (!fs.existsSync(iconsDir)) {
			fs.mkdirSync(iconsDir, { recursive: true })
		}

		for (const [destName, srcPath] of Object.entries(branding.icons)) {
			if (!srcPath) continue

			// Check if absolute, otherwise relative to ROOT (not rebranding dir, to keep it simple unless specified)
			// If user says generic, relative paths often relative to where command is run or config file.
			// Usually config file relative.

			let absoluteSrcPath = srcPath
			if (!path.isAbsolute(srcPath)) {
				// Try resolving relative to rebranding dir first (where branding.json is)
				absoluteSrcPath = path.join(__dirname, srcPath)
				if (!fs.existsSync(absoluteSrcPath)) {
					// Fallback to relative to root
					absoluteSrcPath = path.join(rootDir, srcPath)
				}
			}

			const destPath = path.join(iconsDir, destName)

			if (fs.existsSync(absoluteSrcPath)) {
				fs.copyFileSync(absoluteSrcPath, destPath)
				console.log(`Copied icon ${destName}`)
			} else {
				console.warn(`Icon source not found: ${absoluteSrcPath} (checked relative to rebranding/ and root)`)
			}
		}
	}

	// 4. Update Localization Files (en)
	const localesDir = path.join(rootDir, "webview-ui/src/i18n/locales/en")
	if (fs.existsSync(localesDir)) {
		const files = fs.readdirSync(localesDir)
		const shortName = (branding as any).shortName || branding.displayName.split(" ")[0] || branding.displayName

		files.forEach((file) => {
			if (file.endsWith(".json")) {
				const filePath = path.join(localesDir, file)
				let content = fs.readFileSync(filePath, "utf8")

				// Helper to replace all occurrences of a string
				const replaceAll = (str: string, find: string, replace: string) => {
					return str.split(find).join(replace)
				}

				// Specific phrase replacements first (for detailed control if needed, or just let general rules handle it)

				// "Kilo Code" -> "Jack" (User Request: "kilo code has a question" -> "Jack has a question")
				content = replaceAll(content, "Kilo Code", shortName)

				// "Kilo said" -> "Jack said" (Covered by "Kilo" -> "Jack" below, but being explicit doesn't hurt, though general rule is cleaner)
				// "Kilo" -> "Jack" (User Request: "replace kilo with jack")
				content = replaceAll(content, "Kilo", shortName)

				// "Kilo" might appear in "Kilo Code". If I replaced "Kilo Code" with "Jack" first, then "Kilo" won't match "Code" part.
				// Wait. "Kilo Code" -> "Jack". Content is "Jack has a question".
				// "Kilo said" -> "Jack said".
				// "Kilo wants to run a command" -> "Jack wants to run a command".

				// Edge case: "Kilocode" (one word).
				content = replaceAll(content, "Kilocode", branding.displayName) // Usually proper name

				fs.writeFileSync(filePath, content)
				console.log(`Updated locale file: ${file}`)
			}
		})
	}
}

main().catch(console.error)
