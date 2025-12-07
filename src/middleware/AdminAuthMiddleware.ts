import { Request, Response, NextFunction } from 'express';
import { TokenValidator } from '../security/TokenValidator.js';
import { UserRole } from '../types/enums.js';
import { createLogger } from '../logger/index.js';

/**
 * Admin interface permission verification middleware
 * Ensures only Owner role can access admin interfaces
 */
export class AdminAuthMiddleware {
  // Logger for AdminAuthMiddleware
  private logger = createLogger('AdminAuthMiddleware');
  
  constructor(private tokenValidator: TokenValidator) {}

  /**
   * Verify admin permissions
   */
  authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
      }
      
      const token = authHeader.substring(7);
      
      try {
        const authContext = await this.tokenValidator.validateToken(token);
        
        // Only Owner and Admin roles can access admin interfaces
        if (authContext.role !== UserRole.Owner && authContext.role !== UserRole.Admin) {
          res.status(403).json({
            success: false,
            message: 'Admin access required. Only Owner role can perform admin operations.',
            timestamp: Math.floor(Date.now() / 1000)
          });
          return;
        }
        
        // Set authentication context to request object
        req.authContext = authContext;
        next();
      } catch (error) {
        res.status(401).json({
          success: false,
          message: `Invalid or expired token ${error instanceof Error ? error.message : error}`,
          timestamp: Math.floor(Date.now() / 1000)
        });
      }
    } catch (error) {
      this.logger.error({ error }, 'Admin auth middleware error');
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        timestamp: Math.floor(Date.now() / 1000)
      });
    }
  };
}
