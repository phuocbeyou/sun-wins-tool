import inquirer from 'inquirer';

// Custom renderer để ẩn dòng chọn sau khi hoàn thành prompt
const suppressFinalAnswerRenderer = {
  render() {},
  close() {},
};

export async function mainMenu() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'mainCmd',
      message: '📋 Chọn trò chơi:',
      choices: [
        { name: '🐲  Săn rồng', value: 'dragon_hunt' },
        { name: '⭕  Xóc đĩa tứ linh', value: 'shake-disk' }, 
        { name: '🎥  Xóc đĩa live', value: 'xoc_dia_live' },   
        { name: '🎴  Bacarat live', value: 'bacarat_live' },   
        { name: '🎲  Bầu cua', value: 'fish_prawn_carb' },
        { name: '🔐  Tài khoản', value: 'account_manager' },
        new inquirer.Separator(),
        { name: '❌  Thoát', value: 'exit' },
      ],
      pageSize: 30,
    },
  ], { renderer: suppressFinalAnswerRenderer });

  return answers.mainCmd;
}
