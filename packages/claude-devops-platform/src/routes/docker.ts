import { Router } from 'express';
import { DockerService } from '../services/docker';
import { requirePermission } from '../middleware/auth';
import { asyncHandler, BadRequestError } from '../middleware/error-handler';
import { Permission } from '../types';
import { logger } from '../utils/logger';

export const dockerRouter = Router();

// List images
dockerRouter.get('/images',
  requirePermission(Permission.DOCKER_PULL),
  asyncHandler(async (req, res) => {
    const images = await DockerService.getInstance().listImages();
    
    res.json({
      success: true,
      data: images,
    });
  })
);

// Pull image
dockerRouter.post('/images/pull',
  requirePermission(Permission.DOCKER_PULL),
  asyncHandler(async (req, res) => {
    const { image, tag = 'latest' } = req.body;
    
    if (!image) {
      throw new BadRequestError('Image name is required');
    }
    
    await DockerService.getInstance().pullImage(image, tag);
    
    res.json({
      success: true,
      message: `Image ${image}:${tag} pulled successfully`,
    });
  })
);

// Build image
dockerRouter.post('/build',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const imageId = await DockerService.getInstance().buildImage(req.body);
    
    res.status(201).json({
      success: true,
      data: { imageId },
    });
  })
);

// Push image
dockerRouter.post('/push',
  requirePermission(Permission.DOCKER_PUSH),
  asyncHandler(async (req, res) => {
    const { image, tag = 'latest', registry, username, password } = req.body;
    
    if (!image) {
      throw new BadRequestError('Image name is required');
    }
    
    await DockerService.getInstance().pushImage(image, tag, {
      registry,
      username,
      password,
    });
    
    res.json({
      success: true,
      message: `Image ${image}:${tag} pushed successfully`,
    });
  })
);

// Scan image
dockerRouter.post('/scan',
  requirePermission(Permission.DOCKER_SCAN),
  asyncHandler(async (req, res) => {
    const { repository, tag = 'latest' } = req.body;
    
    if (!repository) {
      throw new BadRequestError('Repository name is required');
    }
    
    const scanResult = await DockerService.getInstance().scanImage(repository, tag);
    
    res.json({
      success: true,
      data: scanResult,
    });
  })
);

// Tag image
dockerRouter.post('/images/:imageName/tag',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const { imageName } = req.params;
    const { target, tag } = req.body;
    
    if (!target || !tag) {
      throw new BadRequestError('Target repository and tag are required');
    }
    
    await DockerService.getInstance().tagImage(imageName, target, tag);
    
    res.json({
      success: true,
      message: `Image tagged as ${target}:${tag}`,
    });
  })
);

// Remove image
dockerRouter.delete('/images/:imageName',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const { imageName } = req.params;
    const { force = false } = req.query;
    
    await DockerService.getInstance().removeImage(imageName, force === 'true');
    
    res.json({
      success: true,
      message: 'Image removed',
    });
  })
);

// List containers
dockerRouter.get('/containers',
  requirePermission(Permission.DOCKER_PULL),
  asyncHandler(async (req, res) => {
    const { all = 'false' } = req.query;
    const containers = await DockerService.getInstance().listContainers(all === 'true');
    
    res.json({
      success: true,
      data: containers,
    });
  })
);

// Create container
dockerRouter.post('/containers',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const container = await DockerService.getInstance().createContainer(req.body);
    
    res.status(201).json({
      success: true,
      data: { id: container.id },
    });
  })
);

// Start container
dockerRouter.post('/containers/:containerId/start',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const { containerId } = req.params;
    
    await DockerService.getInstance().startContainer(containerId);
    
    res.json({
      success: true,
      message: 'Container started',
    });
  })
);

// Stop container
dockerRouter.post('/containers/:containerId/stop',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const { timeout } = req.body;
    
    await DockerService.getInstance().stopContainer(containerId, timeout);
    
    res.json({
      success: true,
      message: 'Container stopped',
    });
  })
);

// Remove container
dockerRouter.delete('/containers/:containerId',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const { force = false } = req.query;
    
    await DockerService.getInstance().removeContainer(containerId, force === 'true');
    
    res.json({
      success: true,
      message: 'Container removed',
    });
  })
);

// Get container logs
dockerRouter.get('/containers/:containerId/logs',
  requirePermission(Permission.DOCKER_PULL),
  asyncHandler(async (req, res) => {
    const { containerId } = req.params;
    const { stdout = 'true', stderr = 'true', tail = '100', since } = req.query;
    
    const logs = await DockerService.getInstance().getContainerLogs(containerId, {
      stdout: stdout === 'true',
      stderr: stderr === 'true',
      tail: parseInt(tail as string, 10),
      since: since ? parseInt(since as string, 10) : undefined,
    });
    
    res.json({
      success: true,
      data: { logs },
    });
  })
);

// System info
dockerRouter.get('/system/info',
  requirePermission(Permission.DOCKER_PULL),
  asyncHandler(async (req, res) => {
    const info = await DockerService.getInstance().getSystemInfo();
    
    res.json({
      success: true,
      data: info,
    });
  })
);

// System disk usage
dockerRouter.get('/system/df',
  requirePermission(Permission.DOCKER_PULL),
  asyncHandler(async (req, res) => {
    const df = await DockerService.getInstance().getSystemDf();
    
    res.json({
      success: true,
      data: df,
    });
  })
);

// Prune containers
dockerRouter.post('/containers/prune',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const result = await DockerService.getInstance().pruneContainers();
    
    res.json({
      success: true,
      data: {
        spaceReclaimed: result.SpaceReclaimed,
      },
    });
  })
);

// Prune images
dockerRouter.post('/images/prune',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const result = await DockerService.getInstance().pruneImages();
    
    res.json({
      success: true,
      data: {
        spaceReclaimed: result.SpaceReclaimed,
      },
    });
  })
);

// Prune volumes
dockerRouter.post('/volumes/prune',
  requirePermission(Permission.DOCKER_BUILD),
  asyncHandler(async (req, res) => {
    const result = await DockerService.getInstance().pruneVolumes();
    
    res.json({
      success: true,
      data: {
        spaceReclaimed: result.SpaceReclaimed,
      },
    });
  })
);

// Registry login
dockerRouter.post('/registry/login',
  requirePermission(Permission.DOCKER_PUSH),
  asyncHandler(async (req, res) => {
    const { username, password, serveraddress } = req.body;
    
    if (!username || !password || !serveraddress) {
      throw new BadRequestError('Username, password, and server address are required');
    }
    
    await DockerService.getInstance().loginToRegistry(username, password, serveraddress);
    
    res.json({
      success: true,
      message: 'Successfully logged into registry',
    });
  })
);