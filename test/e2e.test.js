import * as fs from "fs/promises"
import { existsSync, mkdirSync } from "fs"
import { randomBytes } from "crypto"

function createE2ETest(version) {
    describe(`End-to-End BCF ${version}`, () => {
        let BcfWriter, BcfReader

        beforeAll(async () => {
            const module = await import(`../src/${version}`)
            BcfWriter = module.BcfWriter
            BcfReader = module.BcfReader
        })

        afterAll(async () => {
            // Clean up test output directory
            try {
                const outputDir = `./test-data/bcf${version}/e2e-output`
                if (existsSync(outputDir)) {
                    const files = await fs.readdir(outputDir)
                    for (const file of files) {
                        await fs.unlink(`${outputDir}/${file}`)
                    }
                    await fs.rmdir(outputDir)
                }
            } catch (err) {
                // Ignore cleanup errors
            }
        })

        it("Complete roundtrip: create, write, read, and verify BCF", async () => {
            // Step 1: Create original project data
            const originalProjectId = randomBytes(16).toString('hex')
            const originalProjectName = "E2E Test Project"
            
            const originalTopics = [
                {
                    guid: randomBytes(16).toString('hex'),
                    topic_type: "Issue",
                    topic_status: "Open",
                    title: "Structural Issue in Column A1",
                    description: "The column shows signs of stress and needs immediate attention",
                    creation_author: "John Engineer",
                    creation_date: "2024-01-15T10:30:00Z",
                    priority: "High"
                },
                {
                    guid: randomBytes(16).toString('hex'),
                    topic_type: "Request",
                    topic_status: "In Progress", 
                    title: "Add Fire Exit Sign",
                    description: "Need to add fire exit signage according to local regulations",
                    creation_author: "Safety Inspector",
                    creation_date: "2024-01-16T14:22:00Z",
                    priority: "Medium"
                },
                {
                    guid: randomBytes(16).toString('hex'),
                    topic_type: "Info",
                    topic_status: "Closed",
                    title: "Material Specification Update",
                    description: "Updated material specifications for concrete mix",
                    creation_author: "Materials Engineer", 
                    creation_date: "2024-01-17T09:15:00Z",
                    priority: "Low"
                }
            ]

            const originalMarkups = originalTopics.map(topic => ({
                topic: topic,
                viewpoints: []
            }))

            const originalProject = {
                project_id: originalProjectId,
                name: originalProjectName,
                version: version,
                markups: originalMarkups
            }

            // Step 2: Write BCF file
            const writer = new BcfWriter()
            const writtenBuffer = await writer.write(originalProject)
            
            expect(writtenBuffer).toBeDefined()
            expect(writtenBuffer.length).toBeGreaterThan(0)

            // Step 3: Save to file system
            const outputDir = `./test-data/bcf${version}/e2e-output`
            if (!existsSync(outputDir)) {
                mkdirSync(outputDir, { recursive: true })
            }

            const filePath = `${outputDir}/e2e-test.bcf`
            await fs.writeFile(filePath, writtenBuffer)
            expect(existsSync(filePath)).toBe(true)

            // Step 4: Read BCF file back from file system
            const fileBuffer = await fs.readFile(filePath)
            const reader = new BcfReader()
            await reader.read(fileBuffer)

            // Step 5: Verify project-level data
            expect(reader.project).toBeDefined()
            expect(reader.project.project_id).toBe(originalProjectId)
            expect(reader.project.name).toBe(originalProjectName)
            expect(reader.project.markups).toBeDefined()
            expect(reader.project.markups.length).toBe(3)

            // Step 6: Verify each topic was preserved correctly
            const readTopics = reader.project.markups.map(markup => markup.topic)
            
            // Sort both arrays by title for consistent comparison
            const sortedOriginal = originalTopics.sort((a, b) => a.title.localeCompare(b.title))
            const sortedRead = readTopics.sort((a, b) => a.title.localeCompare(b.title))

            for (let i = 0; i < sortedOriginal.length; i++) {
                const original = sortedOriginal[i]
                const read = sortedRead[i]

                expect(read.guid).toBe(original.guid)
                expect(read.topic_type).toBe(original.topic_type)
                expect(read.topic_status).toBe(original.topic_status)
                expect(read.title).toBe(original.title)
                expect(read.description).toBe(original.description)
                expect(read.creation_author).toBe(original.creation_author)
                expect(read.creation_date).toBe(original.creation_date)
            }

            // Step 7: Test data integrity - modify and write again
            const modifiedProject = reader.project
            modifiedProject.name = "Modified E2E Test Project"
            modifiedProject.markups[0].topic.title = "MODIFIED: " + modifiedProject.markups[0].topic.title
            modifiedProject.markups[0].topic.topic_status = "Closed"

            const writer2 = new BcfWriter()
            const modifiedBuffer = await writer2.write(modifiedProject)
            
            const modifiedFilePath = `${outputDir}/e2e-modified-test.bcf`
            await fs.writeFile(modifiedFilePath, modifiedBuffer)

            // Step 8: Read modified file and verify changes
            const modifiedFileBuffer = await fs.readFile(modifiedFilePath)
            const reader2 = new BcfReader()
            await reader2.read(modifiedFileBuffer)

            expect(reader2.project.name).toBe("Modified E2E Test Project")
            expect(reader2.project.markups[0].topic.title).toContain("MODIFIED:")
            expect(reader2.project.markups[0].topic.topic_status).toBe("Closed")
            expect(reader2.project.markups.length).toBe(3) // Should still have 3 topics
        })

        it("Multiple write-read cycles preserve data integrity", async () => {
            // Step 1: Create initial project
            const projectId = randomBytes(16).toString('hex')
            let project = {
                project_id: projectId,
                name: "Multi-Cycle Test Project",
                version: version,
                markups: [
                    {
                        topic: {
                            guid: randomBytes(16).toString('hex'),
                            topic_type: "Issue",
                            topic_status: "Open",
                            title: "Cycle Test Topic",
                            description: "Initial description",
                            creation_author: "Test Author",
                            creation_date: new Date().toISOString()
                        },
                        viewpoints: []
                    }
                ]
            }

            // Step 2: Perform multiple write-read cycles
            for (let cycle = 1; cycle <= 3; cycle++) {
                // Write BCF
                const writer = new BcfWriter()
                const buffer = await writer.write(project)
                expect(buffer).toBeDefined()

                // Save to file
                const outputDir = `./test-data/bcf${version}/e2e-output`
                if (!existsSync(outputDir)) {
                    mkdirSync(outputDir, { recursive: true })
                }

                const filePath = `${outputDir}/cycle-${cycle}.bcf`
                await fs.writeFile(filePath, buffer)

                // Read back
                const fileBuffer = await fs.readFile(filePath)
                const reader = new BcfReader()
                await reader.read(fileBuffer)

                // Verify data integrity
                expect(reader.project).toBeDefined()
                expect(reader.project.project_id).toBe(projectId)
                expect(reader.project.name).toContain("Multi-Cycle Test Project")
                expect(reader.project.markups.length).toBe(1)
                expect(reader.project.markups[0].topic.title).toContain("Cycle Test Topic")

                // Modify for next cycle
                project = reader.project
                project.name = `Cycle ${cycle} - ${project.name}`
                project.markups[0].topic.description = `Modified in cycle ${cycle}`
                project.markups[0].topic.topic_status = cycle % 2 === 0 ? "Closed" : "Open"
            }

            // Final verification - data should have accumulated changes from all cycles
            expect(project.name).toBe("Cycle 3 - Cycle 2 - Cycle 1 - Multi-Cycle Test Project")
            expect(project.markups[0].topic.description).toBe("Modified in cycle 3")
            expect(project.markups[0].topic.topic_status).toBe("Open") // cycle 3 is odd
        })
    })
}

createE2ETest('2.1')
createE2ETest('3.0') 