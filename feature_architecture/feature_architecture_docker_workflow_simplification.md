# Feature Architecture Document: Docker Workflow Simplification

## Feature Overview

This feature request involves simplifying the existing GitHub Actions workflow for Docker image publishing (`.github/workflows/docker-publish.yml`) to support only single-architecture builds targeting Ubuntu servers on standard VPS infrastructure. The current workflow supports multi-architecture builds (AMD64 and ARM64), but the user requires simplification to just linux/amd64 for normal VPS computer architecture.

## Current State Analysis

The existing workflow includes:
- Multi-architecture Docker builds using Buildx and QEMU
- Support for both linux/amd64 and linux/arm64 platforms
- Architecture-specific tag creation
- Complex manifest verification for multi-arch images
- Detailed summary generation mentioning multiple architectures

## Proposed Changes

### Components to Remove/Simplify

1. **QEMU Setup Removal**
   - Remove `docker/setup-qemu-action@v3` step as cross-compilation is not needed
   - This reduces build time and complexity

2. **Build Platform Simplification**
   - Change `platforms: linux/amd64,linux/arm64` to `platforms: linux/amd64`
   - Remove multi-arch manifest creation logic

3. **Architecture-Specific Tags Removal**
   - Remove steps creating `${VERSION}-amd64`, `${VERSION}-arm64`, `latest-arm64` tags
   - Simplify to only version and latest tags

4. **Manifest Verification Update**
   - Update verification to check single architecture instead of multi-arch manifest
   - Remove architecture-specific inspection commands

5. **Summary Generation Simplification**
   - Update job summary to reflect single architecture support
   - Remove references to ARM64 and multi-arch features
   - Simplify available images table

### High-Level Implementation Steps

1. **Analyze Current Workflow Structure**
   - Review all steps and identify multi-arch dependencies
   - Document current functionality for reference

2. **Remove QEMU and Multi-Arch Setup**
   - Delete QEMU setup step
   - Update build step to single platform

3. **Simplify Build and Push Step**
   - Modify `docker/build-push-action@v6` to use `platforms: linux/amd64`
   - Remove multi-arch specific configurations

4. **Remove Architecture-Specific Tag Creation**
   - Delete entire "Create architecture-specific tags" step
   - Keep only version and latest tag logic

5. **Update Manifest Verification**
   - Simplify verification to check single image manifest
   - Remove multi-arch inspection commands

6. **Update Summary Generation**
   - Modify summary table to show only AMD64 support
   - Update descriptions to reflect single architecture

### Impact Assessment

- **Build Time**: Reduced build time due to single architecture
- **Complexity**: Significantly simplified workflow logic
- **Compatibility**: Maintains compatibility with existing Docker usage patterns
- **Storage**: Reduced registry storage usage (no duplicate ARM64 images)

### Testing Considerations

- Verify the workflow runs successfully on GitHub Actions
- Confirm Docker image builds and pushes correctly
- Test image pull and run functionality on target Ubuntu VPS systems

## Approval Required

Please review this architecture document and confirm approval before proceeding with implementation. Once approved, the implementation will proceed in Code mode to modify the workflow file.