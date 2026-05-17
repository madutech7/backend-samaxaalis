import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une transaction' })
  @ApiResponse({ status: 201, description: 'Transaction créée' })
  async create(@Request() req: any, @Body() dto: CreateTransactionDto) {
    return this.transactionsService.create(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister les transactions (filtres + pagination)' })
  @ApiResponse({ status: 200, description: 'Liste des transactions' })
  async findAll(@Request() req: any, @Query() query: QueryTransactionDto) {
    return this.transactionsService.findAll(req.user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'une transaction' })
  @ApiResponse({ status: 200, description: 'Transaction trouvée' })
  @ApiResponse({ status: 404, description: 'Transaction non trouvée' })
  async findOne(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.findOne(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Modifier une transaction' })
  @ApiResponse({ status: 200, description: 'Transaction modifiée' })
  async update(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTransactionDto,
  ) {
    return this.transactionsService.update(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer une transaction' })
  @ApiResponse({ status: 200, description: 'Transaction supprimée' })
  async remove(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.transactionsService.remove(req.user.id, id);
    return { message: 'Transaction supprimée avec succès' };
  }
}
