import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';

@ApiTags('budgets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un budget' })
  @ApiResponse({ status: 201, description: 'Budget créé' })
  @ApiResponse({
    status: 409,
    description: 'Budget existant pour cette catégorie',
  })
  async create(@Request() req: any, @Body() dto: CreateBudgetDto) {
    return this.budgetsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Lister tous les budgets avec progression',
  })
  @ApiResponse({ status: 200, description: 'Liste des budgets' })
  async findAll(@Request() req: any) {
    return this.budgetsService.findAll(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un budget avec progression' })
  @ApiResponse({ status: 200, description: 'Budget trouvé' })
  @ApiResponse({ status: 404, description: 'Budget non trouvé' })
  async findOne(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.budgetsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier un budget' })
  @ApiResponse({ status: 200, description: 'Budget modifié' })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un budget' })
  @ApiResponse({ status: 200, description: 'Budget supprimé' })
  async remove(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.budgetsService.remove(req.user.id, id);
    return { message: 'Budget supprimé avec succès' };
  }
}
