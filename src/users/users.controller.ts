import {
  Controller,
  Get,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Récupérer mon profil' })
  @ApiResponse({ status: 200, description: 'Profil utilisateur' })
  async getProfile(@Request() req: any) {
    const user = await this.usersService.findById(req.user.id);
    const { password, refreshToken, ...result } = user;
    return result;
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Mettre à jour mon profil' })
  @ApiResponse({ status: 200, description: 'Profil mis à jour' })
  async updateProfile(@Request() req: any, @Body() dto: UpdateUserDto) {
    const user = await this.usersService.update(req.user.id, dto);
    const { password, refreshToken, ...result } = user;
    return result;
  }

  @Delete('profile')
  @ApiOperation({ summary: 'Supprimer mon compte' })
  @ApiResponse({ status: 200, description: 'Compte supprimé' })
  async deleteProfile(@Request() req: any) {
    await this.usersService.remove(req.user.id);
    return { message: 'Compte supprimé avec succès' };
  }
}
