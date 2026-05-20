import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('analyze')
  @ApiOperation({ summary: 'Générer une analyse de santé financière par l\'IA' })
  @ApiResponse({
    status: 200,
    description: 'Analyse générée avec succès (score, résumé, insights, recommandations)',
  })
  async getAnalysis(@Request() req: any) {
    return this.aiService.generateAnalysis(req.user.id);
  }

  @Post('chat')
  @ApiOperation({ summary: 'Discuter avec le coach financier IA (SamaCoach)' })
  @ApiResponse({
    status: 201,
    description: 'Réponse textuelle générée par SamaCoach',
  })
  async chatWithCoach(@Request() req: any, @Body() dto: ChatDto) {
    const reply = await this.aiService.chatWithCoach(req.user.id, dto.message, dto.history);
    return { reply };
  }
}
